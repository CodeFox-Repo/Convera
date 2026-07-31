import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentHostDispatch,
  AgentHostJob,
  IAgentHostAPI,
} from "@/shared/types/agent-host";
import type { ILocalAIAPI } from "@/shared/types/local-ai";
import type { Member } from "@/shared/types/workspace";
import {
  db,
  LOCAL_HUMAN_MEMBER,
  type Agent,
  type Channel,
  type Conversation,
} from "./db/database";
import {
  dispatchAgentHostOffers,
  RendererAgentHostService,
} from "./agent-host-service";

const agent: Agent = {
  id: "fizz",
  name: "Fizz",
  description: "Builds the app",
  systemPrompt: "You are Fizz.",
  disableToolReferences: [],
  providerId: "codex-cli",
  modelId: "gpt-5",
  isBuiltIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const member: Member = {
  id: "agent:fizz",
  workspaceId: "personal",
  kind: "agent",
  name: "Fizz",
  avatar: null,
  agentId: agent.id,
  status: "idle",
};
const conversation: Conversation = {
  id: "conversation",
  title: "Work",
  agentId: null,
  modelId: null,
  activeRevision: 0,
  activeProviderId: null,
  activeModelId: null,
  systemPrompt: null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const channel: Channel = {
  id: "channel",
  workspaceId: "personal",
  groupId: null,
  name: "work",
  kind: "channel",
  isPrivate: false,
  memberIds: [LOCAL_HUMAN_MEMBER.id, member.id],
  conversationId: conversation.id,
  defaultAgentMemberId: member.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const job: AgentHostJob = {
  id: "job",
  channelId: channel.id,
  conversationId: conversation.id,
  triggerMessageId: "human-message",
  contextMessageIds: ["older-message", "human-message"],
  mode: "open-floor",
  offeredAgentMemberIds: [member.id],
  agentId: agent.id,
  agentMemberId: member.id,
  chain: { hops: 0, invoked: [member.id] },
  status: "running",
  attempts: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("RendererAgentHostService", () => {
  const enqueue = vi.fn(async () => ({ success: true, jobs: [job] }));

  beforeEach(async () => {
    enqueue.mockClear();
    await db.open();
    await Promise.all([
      db.messages.clear(),
      db.pendingTurns.clear(),
      db.conversations.clear(),
      db.channels.clear(),
      db.members.clear(),
      db.agents.clear(),
    ]);
    await db.agents.put(agent);
    await db.members.bulkPut([LOCAL_HUMAN_MEMBER, member]);
    await db.conversations.put(conversation);
    await db.channels.put(channel);
    await db.messages.bulkPut([
      {
        id: "older-message",
        conversationId: conversation.id,
        role: "assistant",
        content: "Earlier",
        senderId: member.id,
        createdAt: new Date(1),
      },
      {
        id: "human-message",
        conversationId: conversation.id,
        role: "user",
        content: "Take this",
        senderId: LOCAL_HUMAN_MEMBER.id,
        createdAt: new Date(2),
      },
      {
        id: "later-message",
        conversationId: conversation.id,
        role: "assistant",
        content: "Must not leak into the frozen offer",
        senderId: member.id,
        createdAt: new Date(3),
      },
    ]);
    Object.assign(globalThis, {
      window: {
        agentHost: { enqueue } as unknown as IAgentHostAPI,
        localAI: {} as ILocalAIAPI,
      },
    });
  });

  it("prepares a concurrent tool-only turn from the frozen message boundary", async () => {
    const service = new RendererAgentHostService();
    const before = await db.messages.count();
    const prepared = await service.prepareTurn(job);

    expect(prepared.request).toMatchObject({
      conversationId: conversation.id,
      providerId: "codex-cli",
      modelId: "gpt-5",
      concurrent: true,
      operation: {
        kind: "bootstrap",
        messages: [
          { role: "assistant", content: "Earlier" },
          { role: "user", content: "You: Take this" },
        ],
      },
      agent: { id: agent.id, memberId: member.id },
    });
    expect(prepared.request.agent?.systemPrompt).toContain(
      "The ONLY way to say something here is to call the send_message tool",
    );
    expect(await db.messages.count()).toBe(before);
    expect(await db.pendingTurns.count()).toBe(0);
  });

  it("only enqueues a collaboration-layer dispatch", async () => {
    const dispatch: AgentHostDispatch = {
      channelId: channel.id,
      conversationId: conversation.id,
      triggerMessageId: "human-message",
      contextMessageIds: ["human-message"],
      mode: "direct",
      offeredAgentMemberIds: [member.id],
      targets: [{ agentId: agent.id, memberId: member.id }],
      chain: { hops: 0, invoked: [member.id] },
    };
    expect(await dispatchAgentHostOffers(dispatch)).toEqual([job]);
    expect(enqueue).toHaveBeenCalledWith(dispatch);
  });
});
