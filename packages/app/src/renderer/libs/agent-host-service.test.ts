import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentHostDispatch,
  AgentHostEvent,
  AgentHostJob,
  IAgentHostAPI,
} from "@/shared/types/agent-host";
import type { ILocalAIAPI, LocalAIStreamEvent } from "@/shared/types/local-ai";
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
  formatTaskGuidance,
  RendererAgentHostService,
} from "./agent-host-service";
import { useTypingStore } from "./stores/typing-store";

/**
 * Feeds one stream event in as the host would. `handleStream` is private
 * because the host owns the wiring, but the wiring is exactly what broke:
 * the channel path used to drop every `ui-message`, so the speech tool's own
 * chunks never reached the indicator.
 */
function stream(
  service: RendererAgentHostService,
  event: LocalAIStreamEvent,
): Promise<void> {
  return (
    service as unknown as {
      handleStream(jobId: string, event: LocalAIStreamEvent): Promise<void>;
    }
  ).handleStream(job.id, event);
}

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
  taskId: "job",
  channelId: channel.id,
  channelKind: "channel",
  conversationId: conversation.id,
  triggerMessageId: "human-message",
  contextMessageIds: ["older-message", "human-message"],
  mode: "open-floor",
  offeredAgentMemberIds: [member.id],
  agentId: agent.id,
  agentMemberId: member.id,
  chain: { hops: 0, invoked: [member.id] },
  controlInstructions: [],
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

  it("orders private task guidance and marks newer entries authoritative", () => {
    expect(formatTaskGuidance(["Run tests.", "Show the diff first."])).toMatch(
      /Newer guidance overrides[\s\S]*1\. Run tests\.[\s\S]*2\. Show the diff first\./,
    );
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
    // The room rides the per-turn channel, not the persona: folding it into
    // the prompt changed the session's context fingerprint on every move
    // between rooms and threw the native session away each time.
    expect(prepared.request.agentHost?.roomContext).toContain(
      "You have a send_message tool",
    );
    expect(prepared.request.agent?.systemPrompt).not.toContain(
      "You have a send_message tool",
    );
    expect(await db.messages.count()).toBe(before);
    expect(await db.pendingTurns.count()).toBe(0);
  });

  it("shows typing only while the speech tool is open, never on being offered", async () => {
    useTypingStore.setState({ typing: {} });
    const service = new RendererAgentHostService();
    const prepared = await service.prepareTurn(job);
    const requestId = prepared.request.requestId;
    const typing = () =>
      useTypingStore.getState().typingMemberIds(conversation.id);
    const chunk = (chunk: Record<string, unknown>) =>
      stream(service, {
        type: "ui-message",
        requestId,
        chunk,
      } as LocalAIStreamEvent);

    // Being handed the offer is not composing: everyone in the room gets one.
    expect(typing()).toEqual([]);

    // Neither is looking around, or thinking.
    await chunk({
      type: "tool-input-start",
      toolCallId: "call-read",
      toolName: "workspace:read_channel",
    });
    await chunk({ type: "reasoning-delta", delta: "should I answer?" });
    expect(typing()).toEqual([]);

    await chunk({
      type: "tool-input-start",
      toolCallId: "call-speak",
      toolName: "workspace:send_message",
    });
    expect(typing()).toEqual([member.id]);

    await chunk({ type: "tool-output-available", toolCallId: "call-speak" });
    expect(typing()).toEqual([]);
  });

  it("retires an indicator left open by a turn that died mid-call", async () => {
    useTypingStore.setState({ typing: {} });
    const service = new RendererAgentHostService();
    const prepared = await service.prepareTurn(job);
    await stream(service, {
      type: "ui-message",
      requestId: prepared.request.requestId,
      chunk: {
        type: "tool-input-start",
        toolCallId: "call-speak",
        toolName: "workspace:send_message",
      },
    } as LocalAIStreamEvent);
    expect(useTypingStore.getState().typingMemberIds(conversation.id)).toEqual([
      member.id,
    ]);

    // No closing chunk ever arrives — the job just ends.
    service.dispose();
    expect(useTypingStore.getState().typingMemberIds(conversation.id)).toEqual(
      [],
    );
  });

  it("retires an indicator when a mid-turn agent is paused", async () => {
    useTypingStore.setState({ typing: {} });
    const listeners: Array<(event: AgentHostEvent) => void> = [];
    Object.assign(window, {
      agentHost: {
        enqueue,
        ready: async () => ({ success: true }),
        onRequest: () => () => {},
        onEvent: (callback: (event: AgentHostEvent) => void) => {
          listeners.push(callback);
          return () => {};
        },
      } as unknown as IAgentHostAPI,
    });
    const service = new RendererAgentHostService();
    service.start();
    const prepared = await service.prepareTurn(job);
    await stream(service, {
      type: "ui-message",
      requestId: prepared.request.requestId,
      chunk: {
        type: "tool-input-start",
        toolCallId: "call-speak",
        toolName: "workspace:send_message",
      },
    } as LocalAIStreamEvent);
    expect(useTypingStore.getState().typingMemberIds(conversation.id)).toEqual([
      member.id,
    ]);

    // Pausing aborts the stream, so no closing chunk arrives — and the host
    // deliberately stops at `paused` without ever reaching a terminal status.
    for (const listener of listeners) {
      listener({ type: "job", job: { ...job, status: "paused" } });
    }
    expect(useTypingStore.getState().typingMemberIds(conversation.id)).toEqual(
      [],
    );
  });

  it("keeps the indicator up while a silent direct offer is asked again", async () => {
    useTypingStore.setState({ typing: {} });
    const listeners: Array<(event: AgentHostEvent) => void> = [];
    Object.assign(window, {
      agentHost: {
        enqueue,
        ready: async () => ({ success: true }),
        onRequest: () => () => {},
        onEvent: (callback: (event: AgentHostEvent) => void) => {
          listeners.push(callback);
          return () => {};
        },
      } as unknown as IAgentHostAPI,
    });
    const service = new RendererAgentHostService();
    service.start();
    const prepared = await service.prepareTurn(job);
    const requestId = prepared.request.requestId;
    const typing = () =>
      useTypingStore.getState().typingMemberIds(conversation.id);
    const chunk = (chunk: Record<string, unknown>) =>
      stream(service, {
        type: "ui-message",
        requestId,
        chunk,
      } as LocalAIStreamEvent);

    // First turn opens the speech tool and closes it having said nothing.
    await chunk({
      type: "tool-input-start",
      toolCallId: "call-1",
      toolName: "workspace:send_message",
    });
    await chunk({ type: "tool-output-available", toolCallId: "call-1" });
    expect(typing()).toEqual([]);

    // The executor announces the re-ask before the next turn starts.
    for (const listener of listeners) {
      listener({ type: "retrying", jobId: job.id });
    }
    expect(typing()).toEqual([member.id]);

    // The second turn's own call takes over, and ends the indicator once.
    await chunk({
      type: "tool-input-start",
      toolCallId: "call-2",
      toolName: "workspace:send_message",
    });
    expect(typing()).toEqual([member.id]);
    await chunk({ type: "tool-output-available", toolCallId: "call-2" });
    expect(typing()).toEqual([]);
  });

  it("only enqueues a collaboration-layer dispatch", async () => {
    const dispatch: AgentHostDispatch = {
      channelId: channel.id,
      channelKind: "channel",
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
