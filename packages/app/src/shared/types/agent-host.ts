import type { LocalAIChatRequest, LocalAIStreamEvent } from "./local-ai";

export type AgentHostJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface AgentHostChain {
  /** Agent-authored channel messages since the originating human message. */
  hops: number;
  /** Member ids already invoked by this chain, in order. */
  invoked: string[];
}

export type AgentHostOfferMode = "open-floor" | "direct";

export interface AgentHostTarget {
  /** Stable Agent entity id. Electron main binds the runtime sandbox to it. */
  agentId: string;
  /** Stable workspace participant id used for authorship and native sessions. */
  memberId: string;
}

export interface AgentHostDispatch {
  channelId: string;
  conversationId: string;
  triggerMessageId: string;
  /** Exact transcript boundary shared by everyone offered this message. */
  contextMessageIds: string[];
  /** Direct mentions must answer; an open floor may stay quiet. */
  mode: AgentHostOfferMode;
  /** Everyone who received the same offer, used only to explain the room. */
  offeredAgentMemberIds: string[];
  targets: AgentHostTarget[];
  chain: AgentHostChain;
}

export interface AgentHostJob {
  id: string;
  channelId: string;
  conversationId: string;
  triggerMessageId: string;
  contextMessageIds: string[];
  mode: AgentHostOfferMode;
  offeredAgentMemberIds: string[];
  agentId: string;
  agentMemberId: string;
  chain: AgentHostChain;
  status: AgentHostJobStatus;
  attempts: number;
  requestId?: string;
  turnId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface PreparedAgentHostTurn {
  request: LocalAIChatRequest;
}

export interface AgentHostRendererRequest {
  id: string;
  kind: "prepare-turn";
  job: AgentHostJob;
}

export interface AgentHostRendererResponse {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export type AgentHostEvent =
  | {
      type: "job";
      job: AgentHostJob;
    }
  | {
      type: "stream";
      jobId: string;
      event: LocalAIStreamEvent;
    };

export interface IAgentHostAPI {
  ready(): Promise<{ success: boolean; error?: string }>;
  enqueue(
    dispatch: AgentHostDispatch,
  ): Promise<{ success: boolean; jobs?: AgentHostJob[]; error?: string }>;
  listJobs(): Promise<{
    success: boolean;
    jobs?: AgentHostJob[];
    error?: string;
  }>;
  cancel(
    jobId: string,
  ): Promise<{ success: boolean; cancelled?: boolean; error?: string }>;
  respond(
    response: AgentHostRendererResponse,
  ): Promise<{ success: boolean; accepted?: boolean; error?: string }>;
  onRequest(callback: (request: AgentHostRendererRequest) => void): () => void;
  onEvent(callback: (event: AgentHostEvent) => void): () => void;
}
