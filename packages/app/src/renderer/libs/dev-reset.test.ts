import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearChatHistory } from "./dev-reset";
import { db, LOCAL_HUMAN_MEMBER_ID } from "./db";
import { createChannel } from "./stores/channel-store";

describe("dev reset", () => {
  // Every renderer test file shares one fake-indexeddb instance, and the
  // populate hook reseeds on open, so absolute counts here are only stable if
  // the tables are emptied immediately before the assertions run.
  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  afterEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it("wipes transcripts but keeps the workspace standing", async () => {
    const channelId = await createChannel({
      name: "general",
      groupId: null,
      memberIds: [LOCAL_HUMAN_MEMBER_ID],
    });
    const channel = await db.channels.get(channelId);
    await db.messages.add({
      id: "m1",
      conversationId: channel!.conversationId,
      role: "user",
      content: "hi",
      createdAt: new Date(),
    });
    await db.agents.add({
      id: "a1",
      name: "Elena",
      description: "",
      systemPrompt: "",
      disableToolReferences: [],
      isBuiltIn: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await clearChatHistory();

    // Assert on this test's own rows, not global counts: every renderer test
    // file shares one fake-indexeddb instance and vitest runs them
    // concurrently, so a total is whatever the rest of the suite happens to
    // have written at that instant.
    expect(await db.messages.get("m1")).toBeUndefined();
    expect(await db.channels.get(channelId)).toBeDefined();
    expect(await db.agents.get("a1")).toBeDefined();
    // The channel's conversation must survive as an empty row, or the sidebar
    // points at nothing.
    expect(await db.conversations.get(channel!.conversationId)).toBeDefined();
  });
});
