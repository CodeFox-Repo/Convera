import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  db,
  LOCAL_WORKSPACE_ID,
  type Channel,
  type Member,
  type Message,
} from "../db";
import {
  canViewChannel,
  handleWorkspaceQueryInteraction,
  registerWorkspaceSendMessage,
  resolveWorkspaceQuery,
} from "../workspace-perception";
import { WORKSPACE_QUERY_INTERACTION } from "@/shared/types/workspace-perception";
import type { LocalAIInteractionResponse } from "@/shared/types/local-ai";
import type { TagPermission } from "@/shared/types/workspace";

const AGENT = "agent:fizz";
const HUMAN = "me";

function member(id: string, name: string, kind: Member["kind"]): Member {
  return {
    id,
    workspaceId: LOCAL_WORKSPACE_ID,
    kind,
    name,
    avatar: null,
    agentId: kind === "agent" ? id.slice("agent:".length) : null,
    status: "idle",
  };
}

function channel(
  id: string,
  name: string,
  memberIds: string[],
  overrides: Partial<Channel> = {},
): Channel {
  return {
    id,
    workspaceId: LOCAL_WORKSPACE_ID,
    groupId: "group-hive",
    name,
    kind: "channel",
    isPrivate: false,
    memberIds,
    conversationId: `conversation-${id}`,
    defaultAgentMemberId: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

function message(
  id: string,
  conversationId: string,
  senderId: string,
  content: string,
  minute: number,
): Message {
  return {
    id,
    conversationId,
    role: senderId === HUMAN ? "user" : "assistant",
    content,
    senderId,
    createdAt: new Date(Date.UTC(2026, 6, 1, 0, minute)),
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.channels.clear(),
    db.groups.clear(),
    db.members.clear(),
    db.messages.clear(),
    // Seeded on populate; a surviving row would grant permissions across tests.
    db.tags.clear(),
  ]);
  await db.groups.put({
    id: "group-hive",
    workspaceId: LOCAL_WORKSPACE_ID,
    name: "The Hive",
    icon: null,
    sortOrder: 0,
  });
  await db.members.bulkPut([
    member(HUMAN, "You", "human"),
    member(AGENT, "Fizz", "agent"),
    member("agent:buzz", "Buzz", "agent"),
  ]);
  await db.channels.bulkPut([
    channel("joined", "announcements", [HUMAN, AGENT], {
      description: "The onboarding hall.",
    }),
    channel("visible", "design", [HUMAN, "agent:buzz"]),
    channel("hidden", "founders", [HUMAN], { isPrivate: true }),
  ]);
  await db.messages.bulkPut([
    message("m1", "conversation-joined", HUMAN, "Kickoff is Monday.", 1),
    message("m2", "conversation-joined", AGENT, "Noted.", 2),
    message("m3", "conversation-visible", HUMAN, "Palette review.", 3),
    message("m4", "conversation-hidden", HUMAN, "Board deck.", 4),
  ]);
});

describe("channel visibility", () => {
  const viewer = (
    memberId: string,
    tags: string[] = [],
    permissions: TagPermission[] = [],
  ) => ({ memberId, tags, permissions: new Set(permissions) });

  it("hides a legacy private channel the viewer is not in", () => {
    const priv = channel("p", "founders", [HUMAN], { isPrivate: true });
    expect(canViewChannel(viewer(AGENT), priv)).toBe(false);
    expect(canViewChannel(viewer(HUMAN), priv)).toBe(true);
  });

  it("hides a DM the viewer is not part of", () => {
    const dm = channel("d", "dm", [HUMAN, "agent:buzz"], { kind: "dm" });
    expect(canViewChannel(viewer(AGENT), dm)).toBe(false);
  });

  it("shows a tagged channel only to holders of one of its tags", () => {
    const payroll = channel("p", "payroll", [HUMAN], {
      visibleToTags: ["hr", "finance"],
    });
    expect(canViewChannel(viewer(AGENT), payroll)).toBe(false);
    expect(canViewChannel(viewer(AGENT, ["hr"]), payroll)).toBe(true);
    expect(canViewChannel(viewer(AGENT, ["finance"]), payroll)).toBe(true);
    expect(canViewChannel(viewer(AGENT, ["design"]), payroll)).toBe(false);
  });

  it("gates a tagged channel on the tag, not on membership", () => {
    const payroll = channel("p", "payroll", [HUMAN], {
      visibleToTags: ["hr"],
    });
    // In the room but untagged: still cannot see it. Tagged but not in the
    // room: can find it. That is what makes this a discovery rule.
    expect(canViewChannel(viewer(HUMAN), payroll)).toBe(false);
    expect(canViewChannel(viewer("agent:buzz", ["hr"]), payroll)).toBe(true);
  });

  it("lets any tag granted channel:view-all through, not just admin", () => {
    const payroll = channel("p", "payroll", [HUMAN], {
      visibleToTags: ["hr"],
    });
    expect(
      canViewChannel(viewer(AGENT, ["auditor"], ["channel:view-all"]), payroll),
    ).toBe(true);
    // But a permission that is not about seeing channels grants nothing.
    expect(
      canViewChannel(viewer(AGENT, ["auditor"], ["tag:manage"]), payroll),
    ).toBe(false);
  });

  it("never lets a tag open someone else's DM", () => {
    const dm = channel("d", "dm", [HUMAN, "agent:buzz"], { kind: "dm" });
    expect(
      canViewChannel(viewer(AGENT, ["admin"], ["channel:view-all"]), dm),
    ).toBe(false);
  });

  it("treats a channel with no tags as visible to the whole workspace", () => {
    const open = channel("o", "general", [HUMAN], { visibleToTags: [] });
    expect(canViewChannel(viewer(AGENT), open)).toBe(true);
  });
});

describe("list_channels", () => {
  it("returns joined and not-joined channels, and omits invisible ones", async () => {
    const result = await resolveWorkspaceQuery({
      kind: "list_channels",
      viewerMemberId: AGENT,
    });

    expect(result).toMatchObject({ ok: true, kind: "list_channels" });
    if (!result.ok || result.kind !== "list_channels") throw new Error("bad");
    expect(result.channels).toEqual([
      expect.objectContaining({
        id: "joined",
        name: "announcements",
        joined: true,
        group: "The Hive",
        memberCount: 2,
      }),
      expect.objectContaining({
        id: "visible",
        name: "design",
        joined: false,
        memberCount: 2,
      }),
    ]);
  });

  it("carries each room's description, so an agent can pick where to look", async () => {
    const result = await resolveWorkspaceQuery({
      kind: "list_channels",
      viewerMemberId: AGENT,
    });
    if (!result.ok || result.kind !== "list_channels") throw new Error("bad");
    expect(result.channels[0].description).toBe("The onboarding hall.");
    // A room nobody has described says nothing rather than an empty string.
    expect(result.channels[1]).not.toHaveProperty("description");
  });
});

describe("read_channel", () => {
  it("reads a joined channel's roster and transcript oldest-first", async () => {
    const result = await resolveWorkspaceQuery({
      kind: "read_channel",
      viewerMemberId: AGENT,
      channelId: "joined",
      limit: 30,
    });

    if (!result.ok || result.kind !== "read_channel") throw new Error("bad");
    expect(result.channel.joined).toBe(true);
    expect(result.channel.description).toBe("The onboarding hall.");
    expect(result.channel.truncated).toBe(false);
    expect(result.channel.members.map((entry) => entry.name)).toEqual([
      "You",
      "Fizz",
    ]);
    expect(
      result.channel.messages.map((entry) => [entry.senderName, entry.content]),
    ).toEqual([
      ["You", "Kickoff is Monday."],
      ["Fizz", "Noted."],
    ]);
  });

  it("shows who reacted, by name, so a gesture reads like one", async () => {
    await db.messages.update("m1", {
      reactions: { "👍": [HUMAN, "agent:buzz"], "👀": [AGENT] },
    });

    const result = await resolveWorkspaceQuery({
      kind: "read_channel",
      viewerMemberId: AGENT,
      channelId: "joined",
      limit: 30,
    });

    if (!result.ok || result.kind !== "read_channel") throw new Error("bad");
    expect(result.channel.messages[0].reactions).toEqual([
      { emoji: "👍", reactors: ["You", "Buzz"] },
      { emoji: "👀", reactors: ["Fizz"] },
    ]);
    // A message nobody reacted to says nothing rather than an empty list.
    expect(result.channel.messages[1].reactions).toBeUndefined();
  });

  it("reads a visible channel the agent has not joined", async () => {
    const result = await resolveWorkspaceQuery({
      kind: "read_channel",
      viewerMemberId: AGENT,
      channelId: "visible",
      limit: 30,
    });

    if (!result.ok || result.kind !== "read_channel") throw new Error("bad");
    expect(result.channel.joined).toBe(false);
    expect(result.channel.messages).toHaveLength(1);
  });

  it("refuses a channel the agent may not see without confirming it exists", async () => {
    const hidden = await resolveWorkspaceQuery({
      kind: "read_channel",
      viewerMemberId: AGENT,
      channelId: "hidden",
      limit: 30,
    });
    const absent = await resolveWorkspaceQuery({
      kind: "read_channel",
      viewerMemberId: AGENT,
      channelId: "no-such-channel",
      limit: 30,
    });

    expect(hidden).toMatchObject({
      ok: false,
      error: { code: "CHANNEL_NOT_VISIBLE" },
    });
    // Identical shape, so existence cannot be probed.
    if (hidden.ok || absent.ok) throw new Error("bad");
    expect(hidden.error.code).toBe(absent.error.code);
  });

  it("honours limit by keeping the most recent messages", async () => {
    await db.messages.bulkPut([
      message("m5", "conversation-joined", HUMAN, "Third.", 5),
      message("m6", "conversation-joined", AGENT, "Fourth.", 6),
    ]);

    const result = await resolveWorkspaceQuery({
      kind: "read_channel",
      viewerMemberId: AGENT,
      channelId: "joined",
      limit: 2,
    });

    if (!result.ok || result.kind !== "read_channel") throw new Error("bad");
    expect(result.channel.messages.map((entry) => entry.content)).toEqual([
      "Third.",
      "Fourth.",
    ]);
    expect(result.channel.truncated).toBe(true);
  });

  it("describes a reply even when its parent is outside the read window", async () => {
    await db.messages.put({
      ...message(
        "latest-reply",
        "conversation-joined",
        AGENT,
        "I will take it.",
        8,
      ),
      replyToMessageId: "m1",
    });

    const result = await resolveWorkspaceQuery({
      kind: "read_channel",
      viewerMemberId: AGENT,
      channelId: "joined",
      limit: 1,
    });

    if (!result.ok || result.kind !== "read_channel") throw new Error("bad");
    expect(result.channel.messages).toEqual([
      expect.objectContaining({
        id: "latest-reply",
        replyTo: {
          messageId: "m1",
          senderId: HUMAN,
          senderName: "You",
          content: "Kickoff is Monday.",
        },
      }),
    ]);
  });

  it("trims a transcript that would overflow the transport budget", async () => {
    const body = "x".repeat(1_900);
    await db.messages.bulkPut(
      Array.from({ length: 40 }, (_, index) =>
        message(
          `big-${index}`,
          "conversation-joined",
          HUMAN,
          `${index} ${body}`,
          10 + index,
        ),
      ),
    );

    const result = await resolveWorkspaceQuery({
      kind: "read_channel",
      viewerMemberId: AGENT,
      channelId: "joined",
      limit: 40,
    });

    if (!result.ok || result.kind !== "read_channel") throw new Error("bad");
    expect(result.channel.truncated).toBe(true);
    expect(JSON.stringify(result.channel).length).toBeLessThanOrEqual(18_000);
    expect(result.channel.messages.at(-1)?.content).toContain("39 ");
  });
});

describe("send_message", () => {
  it("passes a valid same-channel reply target to the writer", async () => {
    const handler = vi.fn(async () => ({
      ok: true as const,
      kind: "send_message" as const,
      messageId: "created-reply",
    }));
    registerWorkspaceSendMessage(handler);

    const result = await resolveWorkspaceQuery({
      kind: "send_message",
      viewerMemberId: AGENT,
      channelId: "joined",
      content: "Following up.",
      replyToMessageId: "m1",
    });

    expect(result).toMatchObject({ ok: true, messageId: "created-reply" });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ replyToMessageId: "m1" }),
    );
    registerWorkspaceSendMessage(undefined);
  });

  it("rejects a cross-channel reply target before the writer runs", async () => {
    const handler = vi.fn(async () => ({
      ok: true as const,
      kind: "send_message" as const,
      messageId: "should-not-exist",
    }));
    registerWorkspaceSendMessage(handler);

    const result = await resolveWorkspaceQuery({
      kind: "send_message",
      viewerMemberId: AGENT,
      channelId: "joined",
      content: "Wrong room.",
      replyToMessageId: "m3",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "REPLY_TARGET_NOT_FOUND" },
    });
    expect(handler).not.toHaveBeenCalled();
    registerWorkspaceSendMessage(undefined);
  });

  it("delegates a write to any channel the agent can see, joined or not", async () => {
    const handler = vi.fn(async () => ({
      ok: true as const,
      kind: "send_message" as const,
      messageId: "created-1",
    }));
    registerWorkspaceSendMessage(handler);

    const result = await resolveWorkspaceQuery({
      kind: "send_message",
      viewerMemberId: AGENT,
      channelId: "visible",
      content: "Chiming in from outside.",
    });

    expect(result).toMatchObject({ ok: true, messageId: "created-1" });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "visible", viewerMemberId: AGENT }),
    );
    registerWorkspaceSendMessage(undefined);
  });

  it("refuses a write to a channel the agent cannot see, before the handler runs", async () => {
    const handler = vi.fn(async () => ({
      ok: true as const,
      kind: "send_message" as const,
      messageId: "created-1",
    }));
    registerWorkspaceSendMessage(handler);

    const result = await resolveWorkspaceQuery({
      kind: "send_message",
      viewerMemberId: AGENT,
      channelId: "hidden",
      content: "Should never land.",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CHANNEL_NOT_VISIBLE" },
    });
    expect(handler).not.toHaveBeenCalled();
    registerWorkspaceSendMessage(undefined);
  });

  it("reports unavailability when no handler is registered", async () => {
    expect(
      await resolveWorkspaceQuery({
        kind: "send_message",
        viewerMemberId: AGENT,
        channelId: "joined",
        content: "Anyone home?",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_WRITE_UNAVAILABLE" },
    });
  });
});

describe("add_reaction", () => {
  const react = (channelId: string, messageId: string, emoji = "👍") =>
    resolveWorkspaceQuery({
      kind: "add_reaction",
      viewerMemberId: AGENT,
      channelId,
      messageId,
      emoji,
    });

  it("records the reaction against the agent's own member id", async () => {
    const result = await react("joined", "m1");

    expect(result).toMatchObject({ ok: true, messageId: "m1", emoji: "👍" });
    expect((await db.messages.get("m1"))?.reactions).toEqual({
      "👍": [AGENT],
    });
  });

  it("takes the reaction back when the same emoji is sent again", async () => {
    await react("joined", "m1");
    await react("joined", "m1");

    // The key disappears with its last reactor, so no chip with a zero count.
    expect((await db.messages.get("m1"))?.reactions).toEqual({});
  });

  it("lets an agent react in a visible channel it has not joined", async () => {
    const result = await react("visible", "m3");

    expect(result).toMatchObject({ ok: true, messageId: "m3" });
    expect((await db.messages.get("m3"))?.reactions).toEqual({ "👍": [AGENT] });
  });

  it("refuses a channel the agent cannot see, leaving the message untouched", async () => {
    const result = await react("hidden", "m4");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CHANNEL_NOT_VISIBLE" },
    });
    expect((await db.messages.get("m4"))?.reactions).toBeUndefined();
  });

  it("refuses a message that lives in a different channel", async () => {
    const result = await react("joined", "m3");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "REACTION_TARGET_NOT_FOUND" },
    });
    expect((await db.messages.get("m3"))?.reactions).toBeUndefined();
  });
});

describe("interaction interception", () => {
  it("answers a workspace query without prompting the user", async () => {
    const respond = vi.fn<
      (response: LocalAIInteractionResponse) => Promise<void>
    >(async () => {});
    const handled = handleWorkspaceQueryInteraction(
      {
        type: "interaction",
        requestId: "request-1",
        interactionId: "interaction-1",
        kind: "input",
        name: WORKSPACE_QUERY_INTERACTION,
        prompt: "Workspace query: list_channels",
        input: { kind: "list_channels", viewerMemberId: AGENT },
      },
      respond,
    );

    expect(handled).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
    const [response] = respond.mock.calls[0];
    expect(JSON.parse(response.value ?? "")).toMatchObject({
      ok: true,
      kind: "list_channels",
    });
  });

  it("leaves an ordinary approval interaction on the user path", () => {
    const respond = vi.fn<
      (response: LocalAIInteractionResponse) => Promise<void>
    >(async () => {});
    const handled = handleWorkspaceQueryInteraction(
      {
        type: "interaction",
        requestId: "request-1",
        interactionId: "interaction-2",
        kind: "approval",
        name: "builtin:write_file",
        prompt: "Allow?",
      },
      respond,
    );

    expect(handled).toBe(false);
    expect(respond).not.toHaveBeenCalled();
  });
});
