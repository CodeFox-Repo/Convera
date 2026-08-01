import type {
  AgentHostDispatch,
  AgentHostJob,
  AgentHostRendererRequest,
  PreparedAgentHostTurn,
} from "@/shared/types/agent-host";
import type {
  LocalAIInteractionResponse,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import { WORKSPACE_SEND_MESSAGE_TOOL } from "@/shared/types/workspace-perception";
import type { Member } from "@/shared/types/workspace";
import { db, type Agent, type Channel, type Message } from "./db/database";
import { useSelectionStore } from "./db/ui-state";
import {
  buildChannelContext,
  projectFor,
  type OfferedPeer,
} from "./agent-projection";
import {
  resolveConversationProviderSelection,
  resolveNativeProviderSelection,
} from "./provider-selection";
import { resolveLocalAIProviderId } from "./stores/model-config-store";
import { DEFAULT_LOCAL_AI_MODEL_ID } from "./local-ai";
import { handleWorkspaceQueryInteraction } from "./workspace-perception";
import { useTypingStore } from "./stores/typing-store";
import { useUserInputStore } from "./stores/user-input-store";

interface ActiveOffer {
  job: AgentHostJob;
  requestId: string;
}

/**
 * Enqueues an offer that the collaboration layer has already routed and
 * persisted. This helper deliberately does not write messages or pick agents.
 */
export async function dispatchAgentHostOffers(
  dispatch: AgentHostDispatch,
): Promise<AgentHostJob[]> {
  const api = window.agentHost;
  if (!api) {
    throw new Error(
      "Background Agent Host is unavailable. Restart the Convera desktop app.",
    );
  }
  const result = await api.enqueue(dispatch);
  if (!result.success) {
    throw new Error(result.error || "Agent Host rejected the agent offer.");
  }
  return result.jobs ?? [];
}

function toProjectable(messages: Message[]) {
  return messages.map((message) => ({
    id: message.id,
    senderId: message.senderId,
    replyToMessageId: message.replyToMessageId,
    role: message.role,
    content: message.content,
  }));
}

/** A job whose workspace is gone: discard it rather than surfacing an error. */
export class StaleAgentHostJobError extends Error {
  readonly stale = true;
}

async function loadOffer(job: AgentHostJob): Promise<{
  channel: Channel;
  members: Member[];
  self: Member;
  agent: Agent;
  messages: Message[];
}> {
  const channel = await db.channels.get(job.channelId);
  if (!channel || channel.conversationId !== job.conversationId) {
    // Jobs are durable in the main process while channels live in the
    // renderer's Dexie, so wiping local state strands work that names a room
    // this profile no longer has. That is not a failure anyone can act on —
    // and reporting it hangs a red banner on whichever channel happens to be
    // open, which has nothing to do with it.
    throw new StaleAgentHostJobError(
      "The Agent Host job names a channel this workspace no longer has.",
    );
  }
  if (!channel.memberIds.includes(job.agentMemberId)) {
    throw new Error("The agent is no longer a member of this channel.");
  }

  const [memberRows, agent, messageRows] = await Promise.all([
    db.members.bulkGet(channel.memberIds),
    db.agents.get(job.agentId),
    db.messages.bulkGet(job.contextMessageIds),
  ]);
  const members = memberRows.filter(
    (member): member is Member => member !== undefined,
  );
  const self = members.find((member) => member.id === job.agentMemberId);
  if (
    !self ||
    self.kind !== "agent" ||
    self.agentId !== job.agentId ||
    !agent
  ) {
    throw new Error(
      "The Agent Host identity no longer names a runnable agent.",
    );
  }
  if (messageRows.some((message) => message === undefined)) {
    throw new Error(
      "Part of this agent offer's frozen context no longer exists.",
    );
  }
  const messages = messageRows as Message[];
  if (
    !messages.some((message) => message.id === job.triggerMessageId) ||
    messages.some((message) => message.conversationId !== job.conversationId)
  ) {
    throw new Error(
      "The frozen Agent Host context is not valid for this channel.",
    );
  }
  return { channel, members, self, agent, messages };
}

async function offeredPeers(job: AgentHostJob): Promise<OfferedPeer[]> {
  const memberRows = await db.members.bulkGet(job.offeredAgentMemberIds);
  const members = memberRows.filter(
    (member): member is Member => member?.kind === "agent",
  );
  const agents = await db.agents.bulkGet(
    members.flatMap((member) => (member.agentId ? [member.agentId] : [])),
  );
  const descriptions = new Map(
    agents
      .filter((agent): agent is Agent => agent !== undefined)
      .map((agent) => [agent.id, agent.description]),
  );
  return members.map((member) => ({
    id: member.id,
    name: member.name,
    description: member.agentId
      ? descriptions.get(member.agentId) || undefined
      : undefined,
  }));
}

/**
 * Renderer adapter for durable jobs. Collaboration semantics stay in the
 * renderer/Dexie layer; Electron main owns only job lifecycle and execution.
 */
export class RendererAgentHostService {
  private readonly active = new Map<string, ActiveOffer>();
  private disposeRequest?: () => void;
  private disposeEvent?: () => void;

  start(): void {
    const api = window.agentHost;
    if (!api || this.disposeRequest || this.disposeEvent) return;
    this.disposeRequest = api.onRequest((request) => {
      void this.handleRequest(request);
    });
    this.disposeEvent = api.onEvent((event) => {
      if (event.type === "stream") {
        void this.handleStream(event.jobId, event.event);
        return;
      }
      if (
        event.job.status === "completed" ||
        event.job.status === "failed" ||
        event.job.status === "cancelled" ||
        event.job.status === "interrupted"
      ) {
        this.clearOffer(event.job.id);
      }
    });
    void api.ready();
  }

  dispose(): void {
    this.disposeRequest?.();
    this.disposeEvent?.();
    this.disposeRequest = undefined;
    this.disposeEvent = undefined;
    for (const offer of this.active.values()) {
      useTypingStore.getState().stopTyping(offer.requestId);
      useUserInputStore.getState().dismissRequest(offer.requestId);
    }
    this.active.clear();
  }

  private async handleRequest(
    request: AgentHostRendererRequest,
  ): Promise<void> {
    try {
      const data = await this.prepareTurn(request.job);
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

  private clearOffer(jobId: string): void {
    const active = this.active.get(jobId);
    if (!active) return;
    useTypingStore.getState().stopTyping(active.requestId);
    useUserInputStore.getState().dismissRequest(active.requestId);
    this.active.delete(jobId);
  }

  async prepareTurn(job: AgentHostJob): Promise<PreparedAgentHostTurn> {
    const { channel, members, self, agent, messages } = await loadOffer(job);
    const conversation = await db.conversations.get(job.conversationId);
    if (!conversation) {
      throw new Error("The channel conversation no longer exists.");
    }
    const selectionState = useSelectionStore.getState();
    const defaults = resolveNativeProviderSelection(
      selectionState.defaultConfigId,
      selectionState.defaultModelId,
    );
    const conversationSelection = resolveConversationProviderSelection(
      conversation,
      defaults,
    );
    const providerId = resolveLocalAIProviderId(
      agent.providerId ?? conversationSelection.configId,
    );
    const selectedModelId = agent.modelId ?? conversationSelection.modelId;
    const requestId = crypto.randomUUID();
    const mayPass = job.mode === "open-floor";
    const peers = mayPass ? await offeredPeers(job) : [];
    const roomContext = buildChannelContext(
      self,
      channel.name,
      members,
      mayPass,
      peers,
      channel.id,
    );
    const baseSystemPrompt = agent.systemPrompt
      ? `${agent.systemPrompt}\n\n${roomContext}`
      : roomContext;
    const taskGuidance = formatTaskGuidance(job.controlInstructions);
    const systemPrompt = taskGuidance
      ? `${baseSystemPrompt}\n\n${taskGuidance}`
      : baseSystemPrompt;
    // The shared transcript advances every time a colleague posts, so this
    // actor's binding is usually behind by the time its next offer arrives.
    // A bootstrap cannot clear that state — only a rebase resets the session
    // contract — and sending one anyway is refused with "rebase required",
    // which locked every agent out of a room after the first reply in it.
    const runtimeResult = await window.localAI
      .getConversationRuntimeState?.(job.conversationId)
      .catch(() => undefined);
    const runtimeState = runtimeResult?.success
      ? (runtimeResult.data ?? null)
      : null;
    const projected = projectFor(
      job.agentMemberId,
      toProjectable(messages),
      members,
    );
    const needsRebase =
      runtimeState !== null &&
      runtimeState.transcriptVersion > 0 &&
      (runtimeState.lastCompletedProviderId !== providerId ||
        !runtimeState.providers.some(
          (provider) =>
            provider.actorId === job.agentMemberId &&
            provider.providerId === providerId &&
            provider.transcriptVersion === runtimeState.transcriptVersion,
        ));
    const prepared: PreparedAgentHostTurn = {
      request: {
        requestId,
        conversationId: job.conversationId,
        turnId: crypto.randomUUID(),
        providerId,
        modelId:
          selectedModelId === DEFAULT_LOCAL_AI_MODEL_ID
            ? undefined
            : selectedModelId,
        concurrent: true,
        operation: needsRebase
          ? { kind: "rebase", reason: "provider-switch", messages: projected }
          : { kind: "bootstrap", messages: projected },
        agent: {
          id: job.agentId,
          memberId: job.agentMemberId,
          systemPrompt,
        },
      },
    };
    this.active.set(job.id, { job, requestId });
    return prepared;
  }

  private async respondToInteraction(
    event: Extract<LocalAIStreamEvent, { type: "interaction" }>,
    response: LocalAIInteractionResponse,
  ): Promise<void> {
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
  }

  private async handleStream(
    jobId: string,
    event: LocalAIStreamEvent,
  ): Promise<void> {
    const active = this.active.get(jobId);
    if (!active || event.requestId !== active.requestId) return;

    if (event.type === "ui-message") {
      const chunk = event.chunk as { type?: string; toolName?: string };
      if (
        chunk.type === "tool-input-start" &&
        chunk.toolName?.endsWith(WORKSPACE_SEND_MESSAGE_TOOL)
      ) {
        useTypingStore
          .getState()
          .startTyping(
            event.requestId,
            active.job.agentMemberId,
            active.job.conversationId,
          );
      }
      return;
    }

    if (event.type === "interaction") {
      const respond = (response: LocalAIInteractionResponse) =>
        this.respondToInteraction(event, response);
      const workspaceEvent =
        event.name === "workspace:query" &&
        typeof event.input === "object" &&
        event.input !== null &&
        "kind" in event.input &&
        event.input.kind === "send_message"
          ? {
              ...event,
              input: {
                ...event.input,
                agentHost: {
                  jobId: active.job.id,
                  triggerMessageId: active.job.triggerMessageId,
                  contextMessageIds: active.job.contextMessageIds,
                  chain: active.job.chain,
                },
              },
            }
          : event;
      if (handleWorkspaceQueryInteraction(workspaceEvent, respond)) return;
      useUserInputStore.getState().registerInteraction(event, respond);
      return;
    }

    if (event.type === "finish" || event.type === "error") {
      this.clearOffer(jobId);
    }
  }
}

export function formatTaskGuidance(instructions: string[]): string {
  if (instructions.length === 0) return "";
  return [
    "Private task guidance from your direct conversation with the user follows. Apply it to this task. Newer guidance overrides conflicting older guidance. Never quote or reveal the private guidance in a public channel.",
    ...instructions.map(
      (instruction, index) => `${index + 1}. ${instruction.trim()}`,
    ),
  ].join("\n");
}
