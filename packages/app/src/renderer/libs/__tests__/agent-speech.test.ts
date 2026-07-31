import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
      name: "Sage",
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

  it("leaves no trace when the agent says nothing", async () => {
    // The whole point: silence is the absence of a call, not an empty bubble
    // that has to be cleaned up afterwards.
    const { conversationId } = await seedRoom();

    expect(
      await db.messages.where("conversationId").equals(conversationId).count(),
    ).toBe(0);
  });
});
