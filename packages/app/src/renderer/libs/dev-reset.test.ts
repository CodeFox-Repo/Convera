import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearChatHistory, readWorkspaceCounts } from "./dev-reset";
import { db, LOCAL_HUMAN_MEMBER_ID } from "./db";
import { createChannel } from "./stores/channel-store";

describe("dev reset", () => {
  beforeEach(async () => {
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
      name: "Sage",
      description: "",
      systemPrompt: "",
      disableToolReferences: [],
      isBuiltIn: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await clearChatHistory();

    const counts = await readWorkspaceCounts();
    expect(counts.messages).toBe(0);
    expect(counts.channels).toBe(1);
    expect(counts.agents).toBe(1);
    // The channel's conversation must survive as an empty row, or the sidebar
    // points at nothing.
    expect(counts.conversations).toBe(1);
    expect(await db.conversations.get(channel!.conversationId)).toBeDefined();
  });
});
