import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, LOCAL_HUMAN_MEMBER_ID, memberIdForAgent, type Agent } from "./db";
import {
  agentDMChannelId,
  agentDMConversationId,
  ensureAgentDM,
} from "./agent-dm";

const AGENT: Agent = {
  id: "sage",
  name: "Sage",
  description: "Researcher",
  systemPrompt: "Investigate carefully.",
  disableToolReferences: [],
  selectedMCPs: [],
  providerId: "codex-cli",
  modelId: "gpt-5",
  isBuiltIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("agent direct messages", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.messages.clear(),
      db.channels.clear(),
      db.conversations.clear(),
      db.members.clear(),
      db.agents.clear(),
    ]);
    await db.agents.put(AGENT);
  });

  it("creates one private two-person room with a stable conversation", async () => {
    const first = await ensureAgentDM(AGENT.id);
    const second = await ensureAgentDM(AGENT.id);

    expect(first).toEqual(second);
    expect(first).toEqual({
      channelId: agentDMChannelId(AGENT.id),
      conversationId: agentDMConversationId(AGENT.id),
    });
    expect(await db.channels.count()).toBe(1);
    expect(await db.conversations.count()).toBe(1);
    expect(await db.channels.get(first.channelId)).toMatchObject({
      name: "Sage",
      kind: "dm",
      isPrivate: true,
      memberIds: [LOCAL_HUMAN_MEMBER_ID, memberIdForAgent(AGENT.id)],
      defaultAgentMemberId: memberIdForAgent(AGENT.id),
    });
  });

  it("serializes simultaneous opens without duplicating the room", async () => {
    const opened = await Promise.all([
      ensureAgentDM(AGENT.id),
      ensureAgentDM(AGENT.id),
      ensureAgentDM(AGENT.id),
    ]);

    expect(new Set(opened.map((entry) => entry.channelId)).size).toBe(1);
    expect(await db.channels.count()).toBe(1);
    expect(await db.conversations.count()).toBe(1);
  });

  it("adopts a legacy DM and preserves its transcript", async () => {
    const now = new Date();
    await db.conversations.add({
      id: "legacy-conversation",
      title: "Old Sage chat",
      agentId: AGENT.id,
      modelId: null,
      activeRevision: 0,
      activeProviderId: null,
      activeModelId: null,
      systemPrompt: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.channels.add({
      id: "legacy-dm",
      workspaceId: "personal",
      groupId: null,
      name: "Old Sage",
      kind: "dm",
      isPrivate: true,
      memberIds: [LOCAL_HUMAN_MEMBER_ID, memberIdForAgent(AGENT.id)],
      conversationId: "legacy-conversation",
      defaultAgentMemberId: memberIdForAgent(AGENT.id),
      createdAt: now,
      updatedAt: now,
    });
    await db.messages.add({
      id: "history",
      conversationId: "legacy-conversation",
      role: "user",
      content: "keep this",
      createdAt: now,
    });

    const opened = await ensureAgentDM(AGENT.id);

    expect(opened).toEqual({
      channelId: "legacy-dm",
      conversationId: "legacy-conversation",
    });
    expect(await db.channels.count()).toBe(1);
    expect(await db.messages.get("history")).toBeDefined();
  });

  it("rejects a missing agent without creating records", async () => {
    await expect(ensureAgentDM("missing")).rejects.toThrow(
      "Agent missing does not exist.",
    );
    expect(await db.channels.count()).toBe(0);
    expect(await db.conversations.count()).toBe(0);
  });
});
