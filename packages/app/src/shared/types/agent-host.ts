import type { LocalAIChatRequest, LocalAIStreamEvent } from "./local-ai";

export type AgentHostJobStatus =
  | "queued"
  | "running"
  | "paused"
  | "uncertain"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type AgentHostWorkflowNode =
  | "prepare-turn"
  | "provider-turn"
  | "provider-retry"
  | "finalize";

export interface AgentHostWorkflowCheckpoint {
  id: string;
  parentId?: string;
  step: number;
  next: AgentHostWorkflowNode[];
  values: {
    inputHash: string;
    requestId?: string;
    turnId?: string;
    providerTurnCount: number;
    spoke?: boolean;
    terminalStatus?: "completed" | "failed";
    terminalError?: string;
  };
  committedWriteIds: string[];
  createdAt: string;
}

export interface AgentHostWorkflowNodeAttempt {
  id: string;
  node: AgentHostWorkflowNode;
  attempt: number;
  status: "running" | "completed" | "failed" | "interrupted";
  inputHash: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface AgentHostWorkflowPendingWrite {
  id: string;
  checkpointId: string;
  attemptId: string;
  channel: "node-result";
  value: {
    next: AgentHostWorkflowNode[];
    values: Partial<AgentHostWorkflowCheckpoint["values"]>;
  };
  status: "pending" | "committed";
  createdAt: string;
  committedAt?: string;
}

export interface AgentHostWorkflowEffect {
  id: string;
  attemptId: string;
  kind: "provider-turn";
  idempotencyKey: string;
  inputHash: string;
  requestId: string;
  turnId: string;
  status: "prepared" | "started" | "committed" | "failed" | "uncertain";
  preparedAt: string;
  startedAt?: string;
  completedAt?: string;
  receipt?: {
    spoke: boolean;
    next: AgentHostWorkflowNode[];
    terminalStatus?: "completed" | "failed";
    terminalError?: string;
  };
  error?: string;
}

export interface AgentHostWorkflowState {
  schemaVersion: 1;
  graphVersion: "agent-host-turn-v1";
  stateSchemaVersion: 1;
  threadId: string;
  checkpoint: AgentHostWorkflowCheckpoint;
  checkpoints: AgentHostWorkflowCheckpoint[];
  attempts: AgentHostWorkflowNodeAttempt[];
  pendingWrites: AgentHostWorkflowPendingWrite[];
  effects: AgentHostWorkflowEffect[];
}

export type AgentHostChannelKind = "channel" | "dm";

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

export interface AgentHostStructuredTaskBrief {
  objective: string;
  acceptanceCriteria: string[];
  contextMessageIds: string[];
  outputContract: {
    format: "text" | "json" | "artifact";
    description: string;
    resultSchema?: Record<string, unknown>;
  };
}

export interface AgentHostCollaboration {
  kind: "delegation" | "handoff";
  operationId: string;
  idempotencyKey: string;
  inputHash: string;
  sourceTaskId: string;
  sourceJobId: string;
  fromMemberId: string;
  depth: number;
  path: string[];
  brief: AgentHostStructuredTaskBrief;
  expiresAt?: string;
}

export interface AgentHostDispatch {
  channelId: string;
  channelKind: AgentHostChannelKind;
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
  taskId: string;
  /** A delegated child task. Redirect runs use parentJobId instead. */
  parentTaskId?: string;
  parentJobId?: string;
  channelId: string;
  channelKind: AgentHostChannelKind;
  conversationId: string;
  triggerMessageId: string;
  contextMessageIds: string[];
  mode: AgentHostOfferMode;
  offeredAgentMemberIds: string[];
  agentId: string;
  agentMemberId: string;
  chain: AgentHostChain;
  controlInstructions: string[];
  collaboration?: AgentHostCollaboration;
  /** Renderer/Dexie-owned result messages posted by this run. */
  outputMessageIds?: string[];
  /** Main-owned execution metadata. It stores references and receipts, never transcript text. */
  workflow?: AgentHostWorkflowState;
  maxOutputTokens?: number;
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

export interface AgentHostTaskSummary {
  id: string;
  channelId: string;
  channelKind: AgentHostChannelKind;
  conversationId: string;
  triggerMessageId: string;
  agentId: string;
  agentMemberId: string;
  currentJobId: string;
  parentTaskId?: string;
  collaboration?: AgentHostCollaboration;
  outputMessageIds?: string[];
  status: AgentHostJobStatus;
  runCount: number;
  controlInstructions: string[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export type AgentHostTaskAction = "pause" | "resume" | "cancel";

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
    }
  | {
      /**
       * A direct offer ended without speaking and is being asked again.
       *
       * The room should not see this as the colleague giving up: its first
       * turn closed the speech tool without producing anything, and the next
       * one is about to open a different tool call. Without this the
       * indicator went out and came back for what is, to everyone watching,
       * one agent answering once.
       */
      type: "retrying";
      jobId: string;
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
  listTasks(agentMemberId?: string): Promise<{
    success: boolean;
    tasks?: AgentHostTaskSummary[];
    error?: string;
  }>;
  controlTask(
    taskId: string,
    action: AgentHostTaskAction,
  ): Promise<{ success: boolean; changed?: boolean; error?: string }>;
  redirectTask(
    taskId: string,
    instruction: string,
  ): Promise<{ success: boolean; job?: AgentHostJob; error?: string }>;
  recordOutput(
    jobId: string,
    messageId: string,
  ): Promise<{ success: boolean; recorded?: boolean; error?: string }>;
  cancel(
    jobId: string,
  ): Promise<{ success: boolean; cancelled?: boolean; error?: string }>;
  respond(
    response: AgentHostRendererResponse,
  ): Promise<{ success: boolean; accepted?: boolean; error?: string }>;
  onRequest(callback: (request: AgentHostRendererRequest) => void): () => void;
  onEvent(callback: (event: AgentHostEvent) => void): () => void;
}
