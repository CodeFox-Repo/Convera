/**
 * The invariants worth locking down: deleting a group must not take its
 * channels with it, and deleting a channel must not take its history.
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, LOCAL_HUMAN_MEMBER_ID, type Message } from "../../db";
import { countUnread } from "../../db/hooks";
import { seenAt } from "../../db/ui-state";
import {
  addChannelMember,
  createChannel,
  createGroup,
  deleteChannel,
  deleteGroup,
  moveChannel,
  removeChannelMember,
  renameChannel,
  renameGroup,
  reorderGroups,
  setChannelDescription,
} from "../channel-store";

describe("channel store", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([db.groups.clear(), db.channels.clear()]);
  });

  it("assigns groups increasing sortOrder and reorders them", async () => {
    const a = await createGroup("Hive", "🐝");
    const b = await createGroup("Product");

    expect((await db.groups.get(a))?.sortOrder).toBe(0);
    expect((await db.groups.get(a))?.icon).toBe("🐝");
    expect((await db.groups.get(b))?.sortOrder).toBe(1);

    await reorderGroups([b, a]);
    expect((await db.groups.get(b))?.sortOrder).toBe(0);
    expect((await db.groups.get(a))?.sortOrder).toBe(1);

    await renameGroup(a, "The Hive");
    expect((await db.groups.get(a))?.name).toBe("The Hive");
  });

  it("creates a channel with a backing conversation and default members", async () => {
    const groupId = await createGroup("Product");
    const id = await createChannel({
      name: "design",
      groupId,
      defaultAgentMemberId: "agent:fizz",
    });

    const channel = await db.channels.get(id);
    expect(channel?.groupId).toBe(groupId);
    expect(channel?.kind).toBe("channel");
    expect(channel?.memberIds).toEqual([LOCAL_HUMAN_MEMBER_ID, "agent:fizz"]);
    expect(await db.conversations.get(channel!.conversationId)).toBeDefined();
  });

  it("stores a description and lets it be cleared", async () => {
    const id = await createChannel({
      name: "announcements",
      groupId: null,
      description: "The onboarding hall.",
    });
    expect((await db.channels.get(id))?.description).toBe(
      "The onboarding hall.",
    );

    await setChannelDescription(id, "  Project direction lands here.  ");
    expect((await db.channels.get(id))?.description).toBe(
      "Project direction lands here.",
    );

    // Blank clears it: "#announcements: " tells a colleague nothing.
    await setChannelDescription(id, "   ");
    expect((await db.channels.get(id))?.description).toBeUndefined();
  });

  it("keeps channels when their group is deleted", async () => {
    const groupId = await createGroup("Launch Swarm");
    const id = await createChannel({ name: "flight-path", groupId });

    await deleteGroup(groupId);

    expect(await db.groups.get(groupId)).toBeUndefined();
    expect((await db.channels.get(id))?.groupId).toBeNull();
  });

  it("keeps the conversation when the channel is deleted", async () => {
    const id = await createChannel({ name: "general", groupId: null });
    const conversationId = (await db.channels.get(id))!.conversationId;
    await db.messages.add({
      id: crypto.randomUUID(),
      conversationId,
      role: "user",
      content: "history is sacred",
      createdAt: new Date(),
    });

    await deleteChannel(id);

    expect(await db.channels.get(id)).toBeUndefined();
    expect(await db.conversations.get(conversationId)).toBeDefined();
    expect(
      await db.messages.where("conversationId").equals(conversationId).count(),
    ).toBe(1);
  });

  it("adds and removes roster members without dropping the human", async () => {
    const id = await createChannel({
      name: "roster",
      groupId: null,
      defaultAgentMemberId: "agent:fizz",
    });

    await addChannelMember(id, "agent:buzz");
    await addChannelMember(id, "agent:buzz"); // idempotent
    expect((await db.channels.get(id))?.memberIds).toEqual([
      LOCAL_HUMAN_MEMBER_ID,
      "agent:fizz",
      "agent:buzz",
    ]);

    // Removing the default responder must clear the slot, not orphan it.
    await removeChannelMember(id, "agent:fizz");
    expect((await db.channels.get(id))?.memberIds).toEqual([
      LOCAL_HUMAN_MEMBER_ID,
      "agent:buzz",
    ]);
    expect((await db.channels.get(id))?.defaultAgentMemberId).toBeNull();

    await removeChannelMember(id, LOCAL_HUMAN_MEMBER_ID);
    expect((await db.channels.get(id))?.memberIds).toContain(
      LOCAL_HUMAN_MEMBER_ID,
    );
  });

  it("renames and moves a channel", async () => {
    const groupId = await createGroup("Product");
    const id = await createChannel({ name: "mobile", groupId: null });

    await renameChannel(id, "mobile-app");
    await moveChannel(id, groupId);

    const channel = await db.channels.get(id);
    expect(channel?.name).toBe("mobile-app");
    expect(channel?.groupId).toBe(groupId);
  });
});

describe("unread counts", () => {
  const AGENT = "member-agent";
  const seenAtFor = (conversationId: string) =>
    conversationId === "c1" ? 1000 : 0;

  const message = (over: Partial<Message> = {}): Message =>
    ({
      id: crypto.randomUUID(),
      conversationId: "c1",
      role: "assistant",
      content: "hi",
      senderId: AGENT,
      createdAt: new Date(2000),
      ...over,
    }) as Message;

  it("counts only what arrived after the conversation was last seen", () => {
    const counts = countUnread(
      [
        message({ createdAt: new Date(2000) }),
        message({ createdAt: new Date(3000) }),
        message({ createdAt: new Date(500) }),
      ],
      seenAtFor,
    );
    expect(counts.c1).toBe(2);
  });

  it("never counts your own messages", () => {
    const counts = countUnread(
      [
        message({ senderId: LOCAL_HUMAN_MEMBER_ID, role: "user" }),
        // Pre-multi-agent rows carry no senderId, so role is the fallback.
        message({ senderId: undefined, role: "user" }),
      ],
      seenAtFor,
    );
    expect(counts.c1).toBeUndefined();
  });

  it("ignores transcript plumbing nobody reads", () => {
    const counts = countUnread(
      [message({ role: "tool" }), message({ role: "system" })],
      seenAtFor,
    );
    expect(counts.c1).toBeUndefined();
  });

  it("counts each conversation separately", () => {
    const counts = countUnread(
      [
        message({ conversationId: "c1", createdAt: new Date(3000) }),
        message({ conversationId: "c2", createdAt: new Date(3000) }),
        message({ conversationId: "c2", createdAt: new Date(4000) }),
      ],
      seenAtFor,
    );
    expect(counts).toEqual({ c1: 1, c2: 2 });
  });

  it("falls back to the workspace epoch for a conversation never opened", () => {
    const state = { lastSeen: { c1: 1000 }, epoch: 500 };
    expect(seenAt(state, "c1")).toBe(1000);
    expect(seenAt(state, "never-opened")).toBe(500);
  });
});
