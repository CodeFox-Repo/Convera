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

export interface AgentHostDispatch {
  channelId: string;
  conversationId: string;
  triggerMessageId: string;
  agentMemberIds: string[];
  chain: AgentHostChain;
}

export interface AgentHostJob {
  id: string;
  channelId: string;
  conversationId: string;
  triggerMessageId: string;
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
  assistantMessageId: string;
}

export type AgentHostRendererRequest =
  | {
      id: string;
      kind: "prepare-turn";
      job: AgentHostJob;
    }
  | {
      id: string;
      kind: "settle-turn";
      job: AgentHostJob;
    }
  | {
      id: string;
      kind: "set-member-status";
      memberId: string;
      status: "idle" | "working" | "offline";
    }
  | {
      id: string;
      kind: "channel-tool";
      job: AgentHostJob;
      toolName: AgentHostChannelToolName;
      input: Record<string, unknown>;
    };

export interface SettledAgentHostTurn {
  assistantContent: string;
  triggerMessageId: string;
  followupAgentMemberIds: string[];
  chain: AgentHostChain;
  limitReached: boolean;
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

export const AGENT_HOST_CHANNEL_TOOLS = [
  "read_channel",
  "send_message",
  "edit_message",
  "react",
  "list_members",
] as const;

export type AgentHostChannelToolName =
  (typeof AGENT_HOST_CHANNEL_TOOLS)[number];

export interface AgentHostToolResult {
  result: unknown;
}

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
