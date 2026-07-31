/**
 * The invariants worth locking down: deleting a group must not take its
 * channels with it, and deleting a channel must not take its history.
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, LOCAL_HUMAN_MEMBER_ID } from "../../db";
import { isUnread } from "../../db/ui-state";
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

describe("unread", () => {
  const seen = { c1: 1000 };

  it("marks a conversation unread only when it changed after it was last seen", () => {
    expect(isUnread(seen, "c1", new Date(2000))).toBe(true);
    expect(isUnread(seen, "c1", new Date(500))).toBe(false);
  });

  it("treats a never-seen conversation as read, so the sidebar isn't all bold on first launch", () => {
    expect(isUnread(seen, "unknown", new Date(9999))).toBe(false);
  });
});
