import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  deleteAgent,
  LOCAL_HUMAN_MEMBER_ID,
  LOCAL_WORKSPACE_ID,
  memberIdForAgent,
  useSelectionStore,
  useUnreadStore,
  type Agent,
} from "./db";
import {
  agentDMChannelId,
  agentDMConversationId,
  conversationIsChannel,
  ensureAgentDM,
  openAgentDM,
} from "./agent-dm";

const AGENT: Agent = {
  id: "elena",
  name: "Elena",
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
      name: "Elena",
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
      title: "Old Elena chat",
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
      name: "Old Elena",
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

  it("refuses a DM with the built-in assistant", async () => {
    // The assistant converses through its own many-conversation section; a
    // DM would be the same entity under a second conversation model.
    await expect(ensureAgentDM("default")).rejects.toThrow(
      "built-in assistant",
    );
    expect(await db.channels.count()).toBe(0);
  });

  it("stands the user in the room it opened, already read", async () => {
    useSelectionStore.setState({ currentConversationId: null });
    useUnreadStore.setState({ lastSeen: {} });

    const dm = await openAgentDM(AGENT.id);

    expect(useSelectionStore.getState().currentConversationId).toBe(
      dm.conversationId,
    );
    // Opening a room is reading it: without this the DM you just walked into
    // sits in the sidebar wearing an unread dot.
    expect(useUnreadStore.getState().lastSeen[dm.conversationId]).toEqual(
      expect.any(Number),
    );
  });

  it("takes the direct message with the agent when the agent is fired", async () => {
    const dm = await ensureAgentDM(AGENT.id);
    await db.messages.add({
      id: "said",
      conversationId: dm.conversationId,
      role: "user",
      content: "morning",
      createdAt: new Date(),
    });

    await deleteAgent(AGENT.id);

    // Nobody left to answer, and the DM row carries no delete action — it
    // would have sat in Chats forever, silent.
    expect(await db.channels.get(dm.channelId)).toBeUndefined();
    expect(await db.members.get(memberIdForAgent(AGENT.id))).toBeUndefined();
    // History outlives the room, exactly as deleting a channel leaves it.
    expect(await db.messages.get("said")).toBeDefined();
    expect(await db.conversations.get(dm.conversationId)).toBeDefined();
  });

  it("leaves other people's rooms alone when one agent is fired", async () => {
    const other: Agent = { ...AGENT, id: "raj", name: "Raj" };
    await db.agents.put(other);
    const fired = await ensureAgentDM(AGENT.id);
    const kept = await ensureAgentDM(other.id);

    await deleteAgent(AGENT.id);

    expect(await db.channels.get(fired.channelId)).toBeUndefined();
    expect(await db.channels.get(kept.channelId)).toBeDefined();
  });

  describe("conversationIsChannel", () => {
    it("says yes for a room, so edit and regenerate refuse to truncate it", async () => {
      // Editing the last message in a channel deleted every reply that came
      // after it — in the seeded workspace, all three colleagues' hellos.
      const dm = await ensureAgentDM(AGENT.id);
      expect(await conversationIsChannel(dm.conversationId)).toBe(true);

      await db.channels.put({
        id: "c-announcements",
        workspaceId: LOCAL_WORKSPACE_ID,
        groupId: null,
        conversationId: "conv-announcements",
        name: "announcements",
        kind: "channel",
        isPrivate: false,
        memberIds: [LOCAL_HUMAN_MEMBER_ID, memberIdForAgent(AGENT.id)],
        defaultAgentMemberId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(await conversationIsChannel("conv-announcements")).toBe(true);
    });

    it("says no for a plain assistant chat, which still rewrites freely", async () => {
      // No channel row points at it — the legacy 1:1 path, where truncating
      // costs one assistant reply and nobody else's.
      expect(await conversationIsChannel("conv-plain")).toBe(false);
    });
  });
});
