import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IAgentHostAPI } from "@/shared/types/agent-host";
import { installAgentSpeech } from "../agent-speech";
import { db, LOCAL_HUMAN_MEMBER_ID, memberIdForAgent } from "../db";
import { resolveWorkspaceQuery } from "../workspace-perception";
import { createChannel } from "../stores/channel-store";

const sageMemberId = memberIdForAgent("a-sage");

async function seedRoom(): Promise<{
  channelId: string;
  conversationId: string;
}> {
  await db.members.bulkPut([
    {
      id: LOCAL_HUMAN_MEMBER_ID,
      workspaceId: "personal",
      kind: "human",
      name: "You",
      avatar: null,
      agentId: null,
      status: "idle",
    },
    {
      id: sageMemberId,
      workspaceId: "personal",
      kind: "agent",
      name: "Elena",
      avatar: null,
      agentId: "a-sage",
      status: "idle",
    },
  ]);
  const channelId = await createChannel({
    name: "general",
    groupId: null,
    memberIds: [LOCAL_HUMAN_MEMBER_ID, sageMemberId],
  });
  const channel = await db.channels.get(channelId);
  return { channelId, conversationId: channel!.conversationId };
}

// Every renderer test file shares one fake-indexeddb instance and vitest runs
// them concurrently, so assertions here are scoped to this file's own rows.
beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  installAgentSpeech();
});
afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("agent speech", () => {
  it("posts what the agent said into the channel it named", async () => {
    const { channelId, conversationId } = await seedRoom();

    const result = await resolveWorkspaceQuery({
      kind: "send_message",
      viewerMemberId: sageMemberId,
      channelId,
      content: "shipping the fix now",
    });

    expect(result.ok).toBe(true);
    const posted = await db.messages
      .where("conversationId")
      .equals(conversationId)
      .toArray();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      content: "shipping the fix now",
      senderId: sageMemberId,
      role: "assistant",
      status: "completed",
    });
  });

  it("returns the original message when an AgentHost effect is delivered twice", async () => {
    const { channelId, conversationId } = await seedRoom();
    const query = {
      kind: "send_message" as const,
      viewerMemberId: sageMemberId,
      channelId,
      content: "durable result",
      agentHost: {
        jobId: "job-1",
        effectId: "effect-1",
        payloadHash: "a".repeat(64),
        triggerMessageId: "trigger-1",
        contextMessageIds: ["trigger-1"],
        chain: { hops: 0, invoked: [sageMemberId] },
      },
    };

    const first = await resolveWorkspaceQuery(query);
    const replay = await resolveWorkspaceQuery(query);

    expect(first).toMatchObject({ ok: true, kind: "send_message" });
    expect(replay).toEqual(first);
    expect(
      await db.messages.where("conversationId").equals(conversationId).count(),
    ).toBe(1);
    expect(await db.agentEffectReceipts.get("effect-1")).toMatchObject({
      messageId:
        first.ok && first.kind === "send_message" ? first.messageId : "missing",
      payloadHash: "a".repeat(64),
    });
  });

  it("rejects an AgentHost effect key reused with different content", async () => {
    const { channelId } = await seedRoom();
    const agentHost = {
      jobId: "job-1",
      effectId: "effect-1",
      payloadHash: "a".repeat(64),
      triggerMessageId: "trigger-1",
      contextMessageIds: ["trigger-1"],
      chain: { hops: 0, invoked: [sageMemberId] },
    };
    await resolveWorkspaceQuery({
      kind: "send_message",
      viewerMemberId: sageMemberId,
      channelId,
      content: "first",
      agentHost,
    });

    expect(
      await resolveWorkspaceQuery({
        kind: "send_message",
        viewerMemberId: sageMemberId,
        channelId,
        content: "different",
        agentHost: { ...agentHost, payloadHash: "b".repeat(64) },
      }),
    ).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("different content") },
    });
  });

  it("re-parses mentions from the posted text", async () => {
    // A mention is what routes the next turn, so it has to come from the text
    // that actually landed rather than anything the model claimed alongside it.
    const { channelId, conversationId } = await seedRoom();

    await resolveWorkspaceQuery({
      kind: "send_message",
      viewerMemberId: sageMemberId,
      channelId,
      content: "@You can you confirm?",
    });

    const [posted] = await db.messages
      .where("conversationId")
      .equals(conversationId)
      .toArray();
    expect(posted.mentions).toEqual([LOCAL_HUMAN_MEMBER_ID]);
  });

  it("persists the same-channel message an agent directly replied to", async () => {
    const { channelId, conversationId } = await seedRoom();
    await db.messages.add({
      id: "human-question",
      conversationId,
      role: "user",
      content: "Can you own this?",
      senderId: LOCAL_HUMAN_MEMBER_ID,
      status: "completed",
      createdAt: new Date(),
    });

    const result = await resolveWorkspaceQuery({
      kind: "send_message",
      viewerMemberId: sageMemberId,
      channelId,
      content: "Yes, I have it.",
      replyToMessageId: "human-question",
    });

    if (!result.ok || result.kind !== "send_message") throw new Error("bad");
    expect(await db.messages.get(result.messageId)).toMatchObject({
      senderId: sageMemberId,
      replyToMessageId: "human-question",
      content: "Yes, I have it.",
    });
  });

  it("durably hands an agent mention to the next colleague", async () => {
    const patchMemberId = memberIdForAgent("a-patch");
    const { channelId, conversationId } = await seedRoom();
    await db.members.put({
      id: patchMemberId,
      workspaceId: "personal",
      kind: "agent",
      name: "Mika",
      avatar: null,
      agentId: "a-patch",
      status: "idle",
    });
    const channel = await db.channels.get(channelId);
    await db.channels.update(channelId, {
      memberIds: [...channel!.memberIds, patchMemberId],
    });
    await db.messages.add({
      id: "human-trigger",
      conversationId,
      role: "user",
      content: "Please coordinate",
      senderId: LOCAL_HUMAN_MEMBER_ID,
      createdAt: new Date(1),
    });
    const enqueue = vi.fn(async () => ({ success: true, jobs: [] }));
    Object.assign(globalThis, {
      window: { agentHost: { enqueue } as unknown as IAgentHostAPI },
    });

    await resolveWorkspaceQuery({
      kind: "send_message",
      viewerMemberId: sageMemberId,
      channelId,
      content: "@Mika please take the implementation",
      agentHost: {
        jobId: "job-sage",
        triggerMessageId: "human-trigger",
        contextMessageIds: ["human-trigger"],
        chain: { hops: 0, invoked: [sageMemberId] },
      },
    });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerMessageId: expect.any(String),
        mode: "direct",
        offeredAgentMemberIds: [patchMemberId],
        targets: [{ agentId: "a-patch", memberId: patchMemberId }],
        chain: { hops: 1, invoked: [sageMemberId, patchMemberId] },
      }),
    );
  });

  it("opens the floor when a colleague asks the room, not one person", async () => {
    // "大家怎么样" from an agent used to invite nobody — agent speech was
    // hardcoded closed-floor — so a colleague's open question sat unanswered
    // while the identical sentence from a person filled the room.
    const patchMemberId = memberIdForAgent("a-patch");
    const { channelId, conversationId } = await seedRoom();
    await db.members.put({
      id: patchMemberId,
      workspaceId: "personal",
      kind: "agent",
      name: "Mika",
      avatar: null,
      agentId: "a-patch",
      status: "idle",
    });
    const channel = await db.channels.get(channelId);
    await db.channels.update(channelId, {
      memberIds: [...channel!.memberIds, patchMemberId],
    });
    await db.messages.add({
      id: "human-trigger",
      conversationId,
      role: "user",
      content: "morning",
      senderId: LOCAL_HUMAN_MEMBER_ID,
      createdAt: new Date(1),
    });
    const enqueue = vi.fn(async () => ({ success: true, jobs: [] }));
    Object.assign(globalThis, {
      window: { agentHost: { enqueue } as unknown as IAgentHostAPI },
    });

    await resolveWorkspaceQuery({
      kind: "send_message",
      viewerMemberId: sageMemberId,
      channelId,
      content: "大家现在都在忙什么？",
      agentHost: {
        jobId: "job-sage",
        triggerMessageId: "human-trigger",
        contextMessageIds: ["human-trigger"],
        chain: { hops: 0, invoked: [] },
      },
    });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "open-floor",
        offeredAgentMemberIds: [patchMemberId],
      }),
    );
  });

  it("hands readers the room being posted into, not the one the speaker was in", async () => {
    // Asked in a DM to raise something in #general, the speaker used to pass
    // on its own frozen DM context. Every reader's turn then died on "The
    // frozen Agent Host context is not valid for this channel" — the room went
    // quiet and nothing surfaced why.
    const patchMemberId = memberIdForAgent("a-patch");
    const { channelId, conversationId } = await seedRoom();
    await db.members.put({
      id: patchMemberId,
      workspaceId: "personal",
      kind: "agent",
      name: "Mika",
      avatar: null,
      agentId: "a-patch",
      status: "idle",
    });
    const channel = await db.channels.get(channelId);
    await db.channels.update(channelId, {
      memberIds: [...channel!.memberIds, patchMemberId],
    });
    await db.messages.add({
      id: "room-history",
      conversationId,
      role: "user",
      content: "earlier in this room",
      senderId: LOCAL_HUMAN_MEMBER_ID,
      createdAt: new Date(1),
    });
    // What the speaker was looking at: a message in a different conversation.
    await db.messages.add({
      id: "dm-only",
      conversationId: "conversation:dm:elsewhere",
      role: "user",
      content: "go ask the room",
      senderId: LOCAL_HUMAN_MEMBER_ID,
      createdAt: new Date(2),
    });
    const enqueue = vi.fn(async () => ({ success: true, jobs: [] }));
    Object.assign(globalThis, {
      window: { agentHost: { enqueue } as unknown as IAgentHostAPI },
    });

    await resolveWorkspaceQuery({
      kind: "send_message",
      viewerMemberId: sageMemberId,
      channelId,
      content: "大家现在都在忙什么？",
      agentHost: {
        jobId: "job-sage",
        triggerMessageId: "dm-only",
        contextMessageIds: ["dm-only"],
        chain: { hops: 1, invoked: [sageMemberId] },
      },
    });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        contextMessageIds: expect.arrayContaining(["room-history"]),
      }),
    );
    expect(enqueue).not.toHaveBeenCalledWith(
      expect.objectContaining({
        contextMessageIds: expect.arrayContaining(["dm-only"]),
      }),
    );
  });

  it("leaves no trace when the agent says nothing", async () => {
    // The whole point: silence is the absence of a call, not an empty bubble
    // that has to be cleaned up afterwards.
    const { conversationId } = await seedRoom();

    expect(
      await db.messages.where("conversationId").equals(conversationId).count(),
    ).toBe(0);
  });
});
