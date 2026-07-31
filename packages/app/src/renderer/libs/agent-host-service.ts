import type {
  AgentHostDispatch,
  AgentHostChannelToolName,
  AgentHostJob,
  AgentHostRendererRequest,
  AgentHostToolResult,
  PreparedAgentHostTurn,
  SettledAgentHostTurn,
} from "@/shared/types/agent-host";
import type { LocalAIStreamEvent } from "@/shared/types/local-ai";
import type { Member } from "@/shared/types/workspace";
import type { Message as UIMessage } from "@/renderer/types/chat";
import {
  db,
  LOCAL_HUMAN_MEMBER_ID,
  type Agent,
  type Channel,
  type Conversation,
  type Message,
} from "./db/database";
import { useSelectionStore } from "./db/ui-state";
import { projectFor, buildChannelContext } from "./agent-projection";
import { parseMentions } from "./mention-parser";
import { routeMessage } from "./agent-routing";
import {
  buildLocalAIChatOperation,
  selectAppendOperation,
} from "./local-ai-request";
import {
  resolveConversationProviderSelection,
  resolveNativeProviderSelection,
} from "./provider-selection";
import { resolveLocalAIProviderId } from "./stores/model-config-store";
import { DEFAULT_LOCAL_AI_MODEL_ID } from "./local-ai";
import {
  stagePendingTurn,
  updatePendingTurnJournalState,
  type MessageSnapshot,
} from "./db/hooks";
import {
  completeConversationTurnPersistence,
  registerConversationTurnPersistence,
} from "./conversation-turn-persistence";
import { reconcilePendingTurn } from "./conversation-turn-reconciliation";
import {
  createLocalAIUIMessageStream,
  type LocalAIUIMessageStream,
} from "./local-ai-ui-stream";
import { useUserInputStore } from "./stores/user-input-store";

interface ActiveTurn {
  job: AgentHostJob;
  turnId: string;
  requestId: string;
  assistantMessageId: string;
  stream: LocalAIUIMessageStream;
  liveAssistant: UIMessage;
  writes: Promise<unknown>;
  accepted: boolean;
  error?: Error;
}

function messageSnapshots(messages: Message[]): MessageSnapshot[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    turnId: message.turnId,
    revision: message.revision,
    providerId: message.providerId,
    modelId: message.modelId,
    status: message.status,
    finishReason: message.finishReason,
    senderId: message.senderId,
    mentions: message.mentions,
    reactions: message.reactions,
    parts: message.parts,
    experimental_attachments: message.experimental_attachments,
  }));
}

function toProjectable(messages: Message[]) {
  return messages
    .filter(
      (
        message,
      ): message is Message & {
        role: "user" | "assistant" | "system";
      } => message.role !== "tool",
    )
    .map((message) => ({
      id: message.id,
      senderId: message.senderId,
      role: message.role,
      content: message.content,
    }));
}

function responderPrompt(
  agent: { systemPrompt: string },
  self: Member,
  channelName: string,
  members: Member[],
): string {
  const context = buildChannelContext(self, channelName, members);
  return agent.systemPrompt ? `${agent.systemPrompt}\n\n${context}` : context;
}

async function appendMessage(
  conversationId: string,
  message: Omit<Message, "conversationId" | "createdAt"> & {
    createdAt?: Date;
  },
  pendingTurnId?: string,
): Promise<Message> {
  const persisted: Message = {
    ...message,
    conversationId,
    createdAt: message.createdAt ?? new Date(),
  };
  await db.transaction(
    "rw",
    [db.messages, db.conversations, db.pendingTurns],
    async () => {
      if (!(await db.conversations.get(conversationId))) {
        throw new Error("The channel conversation no longer exists.");
      }
      if (pendingTurnId) {
        const journal = await db.pendingTurns.get(pendingTurnId);
        if (
          !journal ||
          journal.conversationId !== conversationId ||
          journal.state === "committed-awaiting-ack"
        ) {
          throw new Error(
            "The channel tool turn is no longer accepting messages.",
          );
        }
        await db.pendingTurns.update(pendingTurnId, {
          desiredMessageIds: [...journal.desiredMessageIds, persisted.id],
          updatedAt: new Date(),
        });
      }
      await db.messages.add(persisted);
      await db.conversations.update(conversationId, { updatedAt: new Date() });
    },
  );
  return persisted;
}

async function channelMembers(job: AgentHostJob): Promise<{
  channel: Channel;
  members: Member[];
  self: Member;
}> {
  const channel = await db.channels.get(job.channelId);
  if (!channel || channel.conversationId !== job.conversationId) {
    throw new Error("The Agent Host job does not belong to this channel.");
  }
  if (!channel.memberIds.includes(job.agentMemberId)) {
    throw new Error("The agent is no longer a member of this channel.");
  }
  const allMembers = await db.members.bulkGet(channel.memberIds);
  const members = allMembers.filter(
    (member): member is Member => member !== undefined,
  );
  const self = members.find((member) => member.id === job.agentMemberId);
  if (!self || self.kind !== "agent" || !self.agentId) {
    throw new Error("The Agent Host member is not a runnable agent.");
  }
  return { channel, members, self };
}

export async function dispatchChannelAgents(
  dispatch: AgentHostDispatch,
): Promise<void> {
  if (!window.agentHost) {
    throw new Error(
      "Background Agent Host is unavailable. Restart the Convera desktop app.",
    );
  }
  const result = await window.agentHost.enqueue(dispatch);
  if (!result.success) {
    throw new Error(result.error || "Agent Host rejected the channel message.");
  }
}

export async function submitHumanChannelMessage(input: {
  channel: Channel;
  conversation: Conversation;
  content: string;
  attachments?: Message["experimental_attachments"];
  persistedMessageCount: number;
}): Promise<Message> {
  const memberRows = await db.members.bulkGet(input.channel.memberIds);
  const members = memberRows.filter(
    (member): member is Member => member !== undefined,
  );
  const mentions = parseMentions(input.content, members);
  const routed = routeMessage({
    message: {
      senderId: LOCAL_HUMAN_MEMBER_ID,
      content: input.content,
    },
    members,
    defaultAgentMemberId: input.channel.defaultAgentMemberId,
    chain: null,
  });
  const id = `user_${crypto.randomUUID()}`;
  const createdAt = new Date();
  const message: Message = {
    id,
    conversationId: input.channel.conversationId,
    role: "user",
    content: input.content,
    senderId: LOCAL_HUMAN_MEMBER_ID,
    mentions,
    experimental_attachments: input.attachments,
    createdAt,
  };
  await db.transaction("rw", [db.messages, db.conversations], async () => {
    if (!(await db.conversations.get(input.channel.conversationId))) {
      throw new Error("The channel conversation no longer exists.");
    }
    await db.messages.add(message);
    await db.conversations.update(input.channel.conversationId, {
      updatedAt: createdAt,
      metadata: {
        ...(input.conversation.metadata ?? {}),
        messageCount: input.persistedMessageCount + 1,
      },
    });
  });
  if (routed.invoke.length > 0) {
    await dispatchChannelAgents({
      channelId: input.channel.id,
      conversationId: input.channel.conversationId,
      triggerMessageId: id,
      agentMemberIds: routed.invoke,
      chain: routed.chain,
    });
  }
  return message;
}

export class RendererAgentHostService {
  private readonly active = new Map<string, ActiveTurn>();
  private readonly chains = new Map<string, AgentHostJob["chain"]>();
  private disposeRequest?: () => void;
  private disposeEvent?: () => void;

  start(): void {
    const api = window.agentHost;
    if (!api || this.disposeRequest || this.disposeEvent) return;
    this.disposeRequest = api.onRequest((request) => {
      void this.handleRequest(request);
    });
    this.disposeEvent = api.onEvent((event) => {
      if (event.type === "stream")
        void this.handleStream(event.jobId, event.event);
    });
    void this.synchronizeMemberStatuses();
    void api.ready();
  }

  dispose(): void {
    this.disposeRequest?.();
    this.disposeEvent?.();
    this.disposeRequest = undefined;
    this.disposeEvent = undefined;
    for (const turn of this.active.values()) turn.stream.close();
    this.active.clear();
    this.chains.clear();
  }

  private async synchronizeMemberStatuses(): Promise<void> {
    const result = await window.agentHost?.listJobs();
    if (!result?.success) return;
    const working = new Set(
      (result.jobs ?? [])
        .filter((job) => job.status === "queued" || job.status === "running")
        .map((job) => job.agentMemberId),
    );
    await db.members
      .where("kind")
      .equals("agent")
      .modify((member) => {
        member.status = working.has(member.id) ? "working" : "idle";
      });
  }

  private async handleRequest(
    request: AgentHostRendererRequest,
  ): Promise<void> {
    try {
      let data: unknown;
      switch (request.kind) {
        case "prepare-turn":
          data = await this.prepareTurn(request.job);
          break;
        case "settle-turn":
          data = await this.settleTurn(request.job);
          break;
        case "set-member-status":
          await db.members.update(request.memberId, { status: request.status });
          data = { updated: true };
          break;
        case "channel-tool":
          data = await this.executeChannelTool(
            request.job,
            request.toolName,
            request.input,
          );
          break;
      }
      await window.agentHost?.respond({
        requestId: request.id,
        success: true,
        data,
      });
    } catch (error) {
      await window.agentHost?.respond({
        requestId: request.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async prepareTurn(job: AgentHostJob): Promise<PreparedAgentHostTurn> {
    if (!window.localAI) throw new Error("Local AI runtime is unavailable.");
    const { channel, members, self } = await channelMembers(job);
    const agent: Agent | undefined = await db.agents.get(self.agentId!);
    if (!agent) throw new Error("The channel agent no longer exists.");
    const conversation = await db.conversations.get(job.conversationId);
    if (!conversation)
      throw new Error("The channel conversation no longer exists.");
    const messages = await db.messages
      .where("conversationId")
      .equals(job.conversationId)
      .sortBy("createdAt");
    if (!messages.some((message) => message.id === job.triggerMessageId)) {
      throw new Error(
        "The message that triggered this agent no longer exists.",
      );
    }
    const selectionState = useSelectionStore.getState();
    const defaultSelection = resolveNativeProviderSelection(
      selectionState.defaultConfigId,
      selectionState.defaultModelId,
    );
    const providerSelection = resolveConversationProviderSelection(
      conversation,
      defaultSelection,
    );
    const providerId = resolveLocalAIProviderId(providerSelection.configId);
    const runtime = await window.localAI.getConversationRuntimeState(
      job.conversationId,
    );
    if (!runtime.success) {
      throw new Error(
        runtime.error?.message || "Could not read channel runtime state.",
      );
    }
    const projected = projectFor(
      job.agentMemberId,
      toProjectable(messages),
      members,
    );
    const requestedOperation = selectAppendOperation(
      runtime.data ?? null,
      providerId,
      job.agentMemberId,
      messages.length,
    );
    const turnId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const assistantMessageId = `assistant_${crypto.randomUUID()}`;
    const assistant: Message = {
      id: assistantMessageId,
      conversationId: job.conversationId,
      role: "assistant",
      content: "",
      senderId: job.agentMemberId,
      status: "pending",
      createdAt: new Date(),
    };
    registerConversationTurnPersistence(job.conversationId, turnId);
    await stagePendingTurn(
      job.conversationId,
      messageSnapshots(messages),
      messageSnapshots([...messages, assistant]),
      {
        turnId,
        requestId,
        revision: runtime.data?.revision ?? conversation.activeRevision,
        providerId,
        modelId:
          providerSelection.modelId === DEFAULT_LOCAL_AI_MODEL_ID
            ? undefined
            : providerSelection.modelId,
        operation: requestedOperation.kind,
        operationReason:
          requestedOperation.kind === "rebase"
            ? requestedOperation.reason
            : undefined,
        assistantMessageId,
      },
    );

    const liveAssistant: UIMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      senderId: job.agentMemberId,
      createdAt: assistant.createdAt,
    };
    const active: ActiveTurn = {
      job,
      turnId,
      requestId,
      assistantMessageId,
      liveAssistant,
      writes: Promise.resolve(),
      accepted: false,
      stream: undefined as unknown as LocalAIUIMessageStream,
    };
    active.stream = createLocalAIUIMessageStream({
      messageId: assistantMessageId,
      createdAt: assistant.createdAt,
      onMessage: (message) => {
        active.liveAssistant = { ...message, senderId: job.agentMemberId };
        active.writes = active.writes.then(() =>
          db.messages.update(assistantMessageId, {
            content:
              typeof message.content === "string"
                ? message.content
                : JSON.stringify(message.content),
            parts: message.parts,
            status: "streaming",
          }),
        );
      },
      onError: (error) => {
        active.error = error;
      },
    });
    this.active.set(job.id, active);
    this.chains.set(job.id, structuredClone(job.chain));

    return {
      assistantMessageId,
      request: {
        requestId,
        conversationId: job.conversationId,
        turnId,
        expectedRevision: runtime.data?.revision ?? conversation.activeRevision,
        providerId,
        modelId:
          providerSelection.modelId === DEFAULT_LOCAL_AI_MODEL_ID
            ? undefined
            : providerSelection.modelId,
        operation: buildLocalAIChatOperation(
          messages as unknown as UIMessage[],
          requestedOperation,
          projected,
        ),
        agent: {
          id: agent.id,
          memberId: job.agentMemberId,
          systemPrompt: responderPrompt(agent, self, channel.name, members),
        },
        agentHost: {
          jobId: job.id,
          channelId: job.channelId,
          conversationId: job.conversationId,
          triggerMessageId: job.triggerMessageId,
          agentMemberId: job.agentMemberId,
          chain: structuredClone(job.chain),
        },
      },
    };
  }

  private async handleStream(
    jobId: string,
    event: LocalAIStreamEvent,
  ): Promise<void> {
    const active = this.active.get(jobId);
    if (!active || event.requestId !== active.requestId) return;
    if (!active.accepted) {
      active.accepted = true;
      await updatePendingTurnJournalState(
        active.job.conversationId,
        active.turnId,
        "accepted",
      ).catch(() => undefined);
    }
    if (event.type === "ui-message") {
      active.stream.push(event.chunk);
      return;
    }
    if (event.type === "interaction") {
      useUserInputStore
        .getState()
        .registerInteraction(event, async (response) => {
          const result = await window.localAI.respondToInteraction(
            event.requestId,
            event.interactionId,
            response,
          );
          if (!result.success || !result.data?.accepted) {
            throw new Error(
              result.error?.message ||
                "The background agent interaction is no longer active.",
            );
          }
        });
      return;
    }
    if (event.type === "error") {
      active.error = new Error(event.error.message);
      return;
    }
    active.stream.close();
    useUserInputStore.getState().dismissRequest(event.requestId);
  }

  async settleTurn(job: AgentHostJob): Promise<SettledAgentHostTurn> {
    const active = this.active.get(job.id);
    if (active) {
      active.stream.close();
      await active.stream.done;
      await active.writes;
    }
    const turnId = job.turnId ?? active?.turnId;
    if (!turnId) throw new Error("The Agent Host turn id is missing.");
    const result = await reconcilePendingTurn(turnId, {
      liveAssistant: active
        ? {
            content: active.liveAssistant.content,
            senderId: job.agentMemberId,
            parts: active.liveAssistant.parts,
          }
        : undefined,
    });
    if (!result.locallySettled) {
      throw result.error ?? new Error("The background turn is not settled.");
    }
    completeConversationTurnPersistence(turnId);
    this.active.delete(job.id);

    const assistant = active
      ? await db.messages.get(active.assistantMessageId)
      : await db.messages.where("turnId").equals(turnId).last();
    if (!assistant || assistant.status === "failed") {
      throw new Error(
        active?.error?.message ||
          assistant?.finishReason ||
          "The background agent failed.",
      );
    }
    // The pending assistant shell is created before channel:send_message tool
    // calls. Move the completed reply behind those durable progress/handoff
    // messages so the channel reads in the order the agent produced it.
    await db.messages.update(assistant.id, { createdAt: new Date() });
    const { members } = await channelMembers(job);
    const routed = routeMessage({
      message: {
        senderId: job.agentMemberId,
        content: assistant.content,
      },
      members,
      defaultAgentMemberId: null,
      chain: this.chains.get(job.id) ?? job.chain,
    });
    this.chains.delete(job.id);
    return {
      assistantContent: assistant.content,
      triggerMessageId: assistant.id,
      followupAgentMemberIds: routed.invoke,
      chain: routed.chain,
      limitReached: routed.limitReached,
    };
  }

  async executeChannelTool(
    job: AgentHostJob,
    toolName: AgentHostChannelToolName,
    input: Record<string, unknown>,
  ): Promise<AgentHostToolResult> {
    const { channel, members } = await channelMembers(job);
    switch (toolName) {
      case "read_channel": {
        const limit =
          typeof input.limit === "number" ? Math.min(input.limit, 100) : 50;
        const messages = await db.messages
          .where("conversationId")
          .equals(job.conversationId)
          .sortBy("createdAt");
        const before = input.beforeMessageId;
        const end =
          typeof before === "string"
            ? Math.max(
                0,
                messages.findIndex((message) => message.id === before),
              )
            : messages.length;
        const names = new Map(
          members.map((member) => [member.id, member.name]),
        );
        return {
          result: messages
            .slice(Math.max(0, end - limit), end)
            .map((message) => ({
              id: message.id,
              senderId: message.senderId,
              senderName: names.get(message.senderId ?? ""),
              content: message.content,
              createdAt: message.createdAt.toISOString(),
            })),
        };
      }
      case "list_members":
        return {
          result: members.map((member) => ({
            id: member.id,
            name: member.name,
            mention: `@${member.name}`,
            kind: member.kind,
            status: member.status,
          })),
        };
      case "send_message": {
        const content =
          typeof input.content === "string" ? input.content.trim() : "";
        if (!content) throw new Error("Channel message content is required.");
        const pendingTurnId = job.turnId ?? this.active.get(job.id)?.turnId;
        if (!pendingTurnId) {
          throw new Error("The channel tool turn is no longer active.");
        }
        const message = await appendMessage(
          job.conversationId,
          {
            id: `agent-message_${crypto.randomUUID()}`,
            role: "assistant",
            content,
            senderId: job.agentMemberId,
            mentions: parseMentions(content, members),
          },
          pendingTurnId,
        );
        const routed = routeMessage({
          message: { senderId: job.agentMemberId, content },
          members,
          defaultAgentMemberId: null,
          chain: this.chains.get(job.id) ?? job.chain,
        });
        this.chains.set(job.id, routed.chain);
        if (routed.invoke.length > 0) {
          await dispatchChannelAgents({
            channelId: channel.id,
            conversationId: channel.conversationId,
            triggerMessageId: message.id,
            agentMemberIds: routed.invoke,
            chain: routed.chain,
          });
        }
        return {
          result: {
            messageId: message.id,
            mentionedAgentMemberIds: routed.invoke,
            limitReached: routed.limitReached,
          },
        };
      }
      case "edit_message": {
        const messageId =
          typeof input.messageId === "string" ? input.messageId : "";
        const content =
          typeof input.content === "string" ? input.content.trim() : "";
        const message = await db.messages.get(messageId);
        if (
          !message ||
          message.conversationId !== job.conversationId ||
          message.senderId !== job.agentMemberId
        ) {
          throw new Error("Agents may edit only their own channel messages.");
        }
        if (!content) throw new Error("Edited content is required.");
        await db.messages.update(messageId, {
          content,
          mentions: parseMentions(content, members),
        });
        await db.conversations.update(job.conversationId, {
          updatedAt: new Date(),
        });
        return { result: { messageId, edited: true } };
      }
      case "react": {
        const messageId =
          typeof input.messageId === "string" ? input.messageId : "";
        const emoji = typeof input.emoji === "string" ? input.emoji : "";
        const message = await db.messages.get(messageId);
        if (!message || message.conversationId !== job.conversationId) {
          throw new Error("The reaction target is not in this channel.");
        }
        const reactions = structuredClone(message.reactions ?? {});
        const reactors = new Set(reactions[emoji] ?? []);
        if (reactors.has(job.agentMemberId)) reactors.delete(job.agentMemberId);
        else reactors.add(job.agentMemberId);
        if (reactors.size === 0) delete reactions[emoji];
        else reactions[emoji] = [...reactors];
        await db.messages.update(messageId, { reactions });
        return {
          result: {
            messageId,
            emoji,
            active: reactors.has(job.agentMemberId),
          },
        };
      }
      default:
        throw new Error(`Unknown channel tool: ${String(toolName)}`);
    }
  }
}
