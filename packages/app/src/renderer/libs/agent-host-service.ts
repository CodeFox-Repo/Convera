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
import { typingTransition, useTypingStore } from "./stores/typing-store";
import { useUserInputStore } from "./stores/user-input-store";
import { beginTrace, endTrace, noteRetry, recordTrace } from "./agent-trace";

interface ActiveOffer {
  job: AgentHostJob;
  requestId: string;
  /** Speech tool calls this offer opened, so a dead job cannot leave one lit. */
  typing: Set<string>;
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
    // Firing an agent strips it from every roster while its work is still
    // queued in the main process. That is the same nothing-to-act-on case as a
    // missing channel, so it must read as stale rather than fail — the host
    // still sorts the two by message text, hence the shared "no longer has".
    throw new StaleAgentHostJobError(
      "The channel no longer has this agent as a member.",
    );
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
      if (event.type === "retrying") {
        this.holdTyping(event.jobId);
        const active = this.active.get(event.jobId);
        if (active) noteRetry(active.requestId);
        return;
      }
      // Anything that is not still in flight retires the offer. Stated as
      // "not queued or running" rather than by listing the terminal states:
      // pausing a mid-turn agent aborts its stream and then deliberately
      // never reaches a terminal status, so an enumeration missed it and left
      // the room typing forever with no way back — the resumed task replaces
      // `active`, so the leaked tool call became unreachable.
      if (event.job.status !== "queued" && event.job.status !== "running") {
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
      const typing = useTypingStore.getState();
      for (const toolCallId of offer.typing) typing.stopTyping(toolCallId);
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

  /**
   * Keeps the colleague shown as typing while its turn is asked again.
   *
   * The first turn's speech tool has already closed, so nothing in the stream
   * is holding the indicator up; the next turn will open a different
   * `toolCallId` a moment later. Bridging the gap with a placeholder keyed to
   * the job means the room sees one person answering once, which is what
   * happened, instead of an agent that changed its mind.
   */
  private holdTyping(jobId: string): void {
    const active = this.active.get(jobId);
    if (!active) return;
    const placeholder = `retry:${jobId}`;
    active.typing.add(placeholder);
    useTypingStore
      .getState()
      .startTyping(
        placeholder,
        active.job.agentMemberId,
        active.job.conversationId,
      );
  }

  private clearOffer(jobId: string): void {
    const active = this.active.get(jobId);
    if (!active) return;
    void endTrace(active.requestId);
    // A turn that opens the speech tool and then dies never sends the chunk
    // that would retire the indicator, so whoever started one owns clearing it.
    const typing = useTypingStore.getState();
    for (const toolCallId of active.typing) typing.stopTyping(toolCallId);
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
      channel.description,
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
    this.active.set(job.id, { job, requestId, typing: new Set() });
    beginTrace({
      requestId,
      conversationId: job.conversationId,
      memberId: job.agentMemberId,
      jobId: job.id,
    });
    // No typing here. Being offered a message is not composing one — every
    // colleague in the room gets the offer, and lighting all of them up the
    // instant anyone posts claims three replies are coming when most will
    // stay quiet. The indicator is driven by the stream: see handleStream.
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
    recordTrace(event);

    // The only thing the channel path takes from the UI-message stream: a
    // colleague opening its speech tool is the one honest signal that a
    // message is actually coming. Everything else in this stream is that
    // agent's private turn, which nobody in the room can see.
    if (event.type === "ui-message") {
      const transition = typingTransition(event.chunk);
      if (!transition) return;
      const store = useTypingStore.getState();
      if (transition.open) {
        // The retry placeholder has done its job the moment a real call takes
        // over; leaving it would keep the indicator up past the reply.
        const placeholder = `retry:${active.job.id}`;
        if (active.typing.delete(placeholder)) store.stopTyping(placeholder);
        active.typing.add(transition.toolCallId);
        store.startTyping(
          transition.toolCallId,
          active.job.agentMemberId,
          active.job.conversationId,
        );
      } else {
        active.typing.delete(transition.toolCallId);
        store.stopTyping(transition.toolCallId);
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
    // A finished turn is not a finished offer: a direct offer that ended
    // without speaking is asked once more on the same requestId, and dropping
    // the offer here would leave that second turn's send_message unanswered.
    // The job's own terminal status retires it — see start().
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
