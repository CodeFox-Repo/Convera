import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  LOCAL_HUMAN_MEMBER,
  LOCAL_HUMAN_MEMBER_ID,
  memberIdForAgent,
  type Agent,
} from "./db";
import { ensureAgentDM } from "./agent-dm";
import { inspectAgentDMContext } from "./agent-context-inspector";

const AGENT: Agent = {
  id: "sage",
  name: "Sage",
  description: "Researcher",
  systemPrompt: "Investigate carefully.",
  disableToolReferences: [
    { mcpName: "files", toolName: "write", reason: "read only" },
  ],
  selectedMCPs: ["files"],
  providerId: "codex-cli",
  modelId: "gpt-5",
  isBuiltIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("agent context inspector", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.messages.clear(),
      db.channels.clear(),
      db.conversations.clear(),
      db.members.clear(),
      db.agents.clear(),
    ]);
    await db.members.put(LOCAL_HUMAN_MEMBER);
    await db.agents.put(AGENT);
  });

  it("shows the exact renderer-owned prompt, projection and visible rooms", async () => {
    const dm = await ensureAgentDM(AGENT.id);
    const now = new Date();
    await db.messages.bulkAdd([
      {
        id: "human-message",
        conversationId: dm.conversationId,
        role: "user",
        senderId: LOCAL_HUMAN_MEMBER_ID,
        content: "What changed?",
        createdAt: now,
      },
      {
        id: "agent-message",
        conversationId: dm.conversationId,
        role: "assistant",
        senderId: memberIdForAgent(AGENT.id),
        content: "I will check.",
        createdAt: new Date(now.getTime() + 1),
      },
    ]);
    await db.channels.bulkAdd([
      {
        id: "public",
        workspaceId: "personal",
        groupId: null,
        name: "public-room",
        kind: "channel",
        isPrivate: false,
        memberIds: [LOCAL_HUMAN_MEMBER_ID],
        conversationId: "public-conversation",
        defaultAgentMemberId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "private",
        workspaceId: "personal",
        groupId: null,
        name: "hidden-room",
        kind: "channel",
        isPrivate: true,
        memberIds: [LOCAL_HUMAN_MEMBER_ID],
        conversationId: "private-conversation",
        defaultAgentMemberId: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const context = await inspectAgentDMContext(dm.channelId);

    expect(context.injected.effectiveSystemPrompt).toContain(
      "Investigate carefully.",
    );
    expect(context.injected.effectiveSystemPrompt).toContain(
      `channel_id: ${dm.channelId}`,
    );
    expect(context.injected.transcriptProjection).toEqual([
      { role: "user", content: "You: What changed?" },
      { role: "assistant", content: "I will check." },
    ]);
    expect(context.available.visibleChannels.map((room) => room.name)).toEqual([
      "public-room",
      "Sage",
    ]);
    expect(context.available.configuredMcpServerIds).toEqual(["files"]);
    expect(context.opaque.map((entry) => entry.label)).toContain(
      "Provider-native session history",
    );
  });

  it("refuses to derive private agent context for a public channel", async () => {
    const now = new Date();
    await db.channels.add({
      id: "public",
      workspaceId: "personal",
      groupId: null,
      name: "public-room",
      kind: "channel",
      isPrivate: false,
      memberIds: [LOCAL_HUMAN_MEMBER_ID],
      conversationId: "public-conversation",
      defaultAgentMemberId: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(inspectAgentDMContext("public")).rejects.toThrow(
      "only inside a private DM",
    );
  });
});
