import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentHostJob, IAgentHostAPI } from "@/shared/types/agent-host";
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
  RendererAgentHostService,
  submitHumanChannelMessage,
} from "./agent-host-service";
import { reconcilePendingTurn } from "./conversation-turn-reconciliation";

const fizzAgent: Agent = {
  id: "fizz",
  name: "Fizz",
  description: "",
  systemPrompt: "",
  disableToolReferences: [],
  isBuiltIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fizz: Member = {
  id: "agent:fizz",
  workspaceId: "personal",
  kind: "agent",
  name: "Fizz",
  avatar: null,
  agentId: fizzAgent.id,
  status: "idle",
};

const honey: Member = {
  id: "agent:honey",
  workspaceId: "personal",
  kind: "agent",
  name: "Honey",
  avatar: null,
  agentId: "honey",
  status: "idle",
};

const conversation: Conversation = {
  id: "conversation",
  title: "Flight path",
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
  name: "flight-path",
  kind: "channel",
  isPrivate: false,
  memberIds: [LOCAL_HUMAN_MEMBER.id, fizz.id, honey.id],
  conversationId: conversation.id,
  defaultAgentMemberId: fizz.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const job: AgentHostJob = {
  id: "job",
  channelId: channel.id,
  conversationId: conversation.id,
  triggerMessageId: "human-message",
  agentMemberId: fizz.id,
  chain: { hops: 0, invoked: [fizz.id] },
  status: "running",
  attempts: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("RendererAgentHostService channel tools", () => {
  const enqueue = vi.fn(async () => ({ success: true, jobs: [] }));

  beforeEach(async () => {
    enqueue.mockClear();
    await db.open();
    await db.transaction(
      "rw",
      [
        db.messages,
        db.pendingTurns,
        db.pendingConversationDeletions,
        db.conversations,
        db.channels,
        db.members,
        db.agents,
      ],
      async () => {
        await Promise.all([
          db.messages.clear(),
          db.pendingTurns.clear(),
          db.pendingConversationDeletions.clear(),
          db.conversations.clear(),
          db.channels.clear(),
          db.members.clear(),
          db.agents.clear(),
        ]);
        await db.agents.put(fizzAgent);
        await db.members.bulkPut([LOCAL_HUMAN_MEMBER, fizz, honey]);
        await db.conversations.put(conversation);
        await db.channels.put(channel);
        await db.messages.put({
          id: "human-message",
          conversationId: conversation.id,
          role: "user",
          content: "@Fizz take this",
          senderId: LOCAL_HUMAN_MEMBER.id,
          createdAt: new Date(),
        });
      },
    );
    Object.assign(globalThis, {
      window: {
        agentHost: { enqueue } as unknown as IAgentHostAPI,
        localAI: {
          getConversationRuntimeState: vi.fn(async () => ({
            success: true,
            data: null,
          })),
          getTurnRuntimeState: vi.fn(
            async (request: { conversationId: string; turnId: string }) => ({
              success: true,
              data: {
                ...request,
                requestId: "request",
                providerId: "claude-code",
                revision: 1,
                status: "completed",
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                finishReason: "stop",
                assistantText: "Done",
              },
            }),
          ),
          acknowledgeTurnPersistence: vi.fn(async () => ({
            success: true,
            data: { acknowledged: true },
          })),
        } as unknown as ILocalAIAPI,
      },
    });
  });

  it("stages a durable actor-isolated turn for the main-process host", async () => {
    const service = new RendererAgentHostService();
    const prepared = await service.prepareTurn(job);

    expect(prepared.request).toMatchObject({
      conversationId: conversation.id,
      providerId: "claude-code",
      operation: {
        kind: "bootstrap",
        messages: [
          {
            role: "user",
            content: "You: @Fizz take this",
          },
        ],
      },
      agent: {
        id: fizzAgent.id,
        memberId: fizz.id,
      },
      agentHost: {
        jobId: job.id,
        channelId: channel.id,
        agentMemberId: fizz.id,
      },
    });
    expect(await db.pendingTurns.get(prepared.request.turnId)).toMatchObject({
      requestId: prepared.request.requestId,
      assistantMessageId: prepared.assistantMessageId,
      state: "staged",
    });
    expect(await db.messages.get(prepared.assistantMessageId)).toMatchObject({
      senderId: fizz.id,
      status: "pending",
    });
  });

  it("persists a human channel message before dispatching mentions or the default", async () => {
    const first = await submitHumanChannelMessage({
      channel,
      conversation,
      content: "Please take the default queue",
      persistedMessageCount: 1,
    });
    expect(await db.messages.get(first.id)).toMatchObject({
      senderId: LOCAL_HUMAN_MEMBER.id,
      content: "Please take the default queue",
    });
    expect(enqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        triggerMessageId: first.id,
        agentMemberIds: [fizz.id],
      }),
    );

    const second = await submitHumanChannelMessage({
      channel,
      conversation,
      content: "@Honey handle this instead",
      persistedMessageCount: 2,
    });
    expect(enqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        triggerMessageId: second.id,
        agentMemberIds: [honey.id],
      }),
    );
  });

  it("injects the actor identity and dispatches callback mentions", async () => {
    const service = new RendererAgentHostService();
    const prepared = await service.prepareTurn(job);
    const result = await service.executeChannelTool(job, "send_message", {
      content: "Progress is ready. @Honey please verify.",
    });
    const posted = await db.messages.get(
      (result.result as { messageId: string }).messageId,
    );

    expect(posted).toMatchObject({
      senderId: fizz.id,
      role: "assistant",
      mentions: [honey.id],
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerMessageId: posted?.id,
        agentMemberIds: [honey.id],
      }),
    );
    expect(
      (await db.pendingTurns.get(prepared.request.turnId))?.desiredMessageIds,
    ).toContain(posted?.id);

    const repeated = await service.executeChannelTool(job, "send_message", {
      content: "@Honey again",
    });
    expect(
      (repeated.result as { mentionedAgentMemberIds: string[] })
        .mentionedAgentMemberIds,
    ).toEqual([]);
    expect(enqueue).toHaveBeenCalledTimes(1);

    await reconcilePendingTurn(prepared.request.turnId, {
      liveAssistant: { content: "Done", senderId: fizz.id },
    });
    expect(await db.messages.get(posted!.id)).toMatchObject({
      content: "Progress is ready. @Honey please verify.",
      senderId: fizz.id,
    });
  });

  it("refuses to edit another member's message", async () => {
    const service = new RendererAgentHostService();
    await expect(
      service.executeChannelTool(job, "edit_message", {
        messageId: "human-message",
        content: "impersonated",
      }),
    ).rejects.toThrow("only their own");
    expect((await db.messages.get("human-message"))?.content).toBe(
      "@Fizz take this",
    );
  });

  it("refuses all channel tools after membership is removed", async () => {
    await db.channels.update(channel.id, {
      memberIds: [LOCAL_HUMAN_MEMBER.id, honey.id],
    });
    const service = new RendererAgentHostService();
    await expect(
      service.executeChannelTool(job, "list_members", {}),
    ).rejects.toThrow("no longer a member");
  });
});
