import type {
  LocalAIChatOperation,
  LocalAIFinishReason,
  LocalAIRebaseReason,
  LocalAITurnRuntimeState,
} from "@/shared/types/local-ai";
import type { LocalAiProviderId } from "../types";

export const LOCAL_AI_RUNTIME_STATE_SCHEMA_VERSION = 2 as const;

export interface ProviderMemoryCursor {
  version: number;
  epoch: number;
}

export type ProviderMemoryCursors = Record<string, ProviderMemoryCursor>;

export interface ProviderSessionBinding {
  conversationId: string;
  providerId: LocalAiProviderId;
  revision: number;
  nativeSessionId: string;
  cwd: string;
  modelId?: string;
  stale: boolean;
  transcriptVersion: number;
  memoryCursors?: ProviderMemoryCursors;
  updatedAt: string;
}

export type SessionTurnStatus =
  | "pending"
  | "completed"
  | "failed"
  | "aborted"
  | "uncertain"
  | "interrupted";

export interface SessionTurnRecord {
  turnId: string;
  requestId: string;
  conversationId: string;
  providerId: LocalAiProviderId;
  revision: number;
  operation: LocalAIChatOperation["kind"];
  operationReason?: LocalAIRebaseReason;
  status: SessionTurnStatus;
  startedAt: string;
  providerStartedAt?: string;
  completedAt?: string;
  nativeSessionId?: string;
  modelId?: string;
  finishReason?: LocalAIFinishReason;
  assistantText?: string;
  assistantTextTruncated?: boolean;
  rendererPersistedAt?: string;
  error?: string;
}

export interface ConversationSessionState {
  conversationId: string;
  revision: number;
  transcriptVersion: number;
  lastCompletedProviderId?: LocalAiProviderId;
  memoryEpoch: number;
  memoryVersion: number;
  updatedAt: string;
}

export type ConversationDeletionStatus = "deleting" | "completed";

/**
 * Main-process write-ahead record for a conversation deletion.
 *
 * This record deliberately outlives the conversation row. It both gives
 * deletion replay a stable idempotency key and prevents a delayed renderer or
 * provider callback from recreating a conversation after deletion completed.
 */
export interface ConversationDeletionRecord {
  conversationId: string;
  operationId: string;
  forgetConversationMemory: boolean;
  status: ConversationDeletionStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  lastError?: string;
}

export interface DurableMemoryScope {
  kind: "user" | "workspace" | "conversation";
  id: string;
}

export interface DurableMemoryTurnHookPayload {
  kind: "memory-turn";
  /**
   * Stable memory-backend identifier. Optional only for reading
   * pre-source-binding state; replay must pause unbound legacy records.
   */
  sourceId?: string;
  turnId: string;
  conversationId: string;
  revision: number;
  providerId: LocalAiProviderId;
  scopes: DurableMemoryScope[];
  userContent: string;
  userContentTruncated?: boolean;
  assistantContent?: string;
  assistantContentTruncated?: boolean;
}

export type DurableTurnHookOutcome = "completed" | "failed";

/**
 * A main-process outbox record for post-provider work. `armed` records ensure
 * a process crash can still clean candidates created during an interrupted
 * turn. `pending` records replay completion curation or failure cleanup.
 */
export interface DurableTurnHookRecord {
  hookId: string;
  turnId: string;
  conversationId: string;
  outcome?: DurableTurnHookOutcome;
  status: "armed" | "pending";
  payload: DurableMemoryTurnHookPayload;
  attempts: number;
  retryable: boolean;
  createdAt: string;
  updatedAt: string;
  terminalAt?: string;
  nextAttemptAt?: string;
  lastError?: string;
  pauseReason?: "configuration";
}

export interface LocalAiRuntimeState {
  schemaVersion: typeof LOCAL_AI_RUNTIME_STATE_SCHEMA_VERSION;
  conversations: ConversationSessionState[];
  bindings: ProviderSessionBinding[];
  turns: SessionTurnRecord[];
  /**
   * Optional for backwards compatibility with schema-v2 state written before
   * durable conversation deletion was introduced.
   */
  deletions?: ConversationDeletionRecord[];
  /**
   * Optional for backwards compatibility with schema-v2 state written before
   * durable terminal hooks were introduced.
   */
  turnHooks?: DurableTurnHookRecord[];
}

export interface BeginSessionTurnInput {
  turnId: string;
  requestId: string;
  conversationId: string;
  providerId: LocalAiProviderId;
  operation: LocalAIChatOperation["kind"];
  operationReason?: LocalAIRebaseReason;
  expectedRevision?: number;
}

export interface PreparedSessionTurn {
  turn: SessionTurnRecord;
  conversation: ConversationSessionState;
  binding?: ProviderSessionBinding;
}

export interface CompleteSessionTurnInput {
  turnId: string;
  nativeSessionId: string;
  cwd: string;
  modelId?: string;
  finishReason?: LocalAIFinishReason;
  assistantText?: string;
  memoryCursors?: ProviderMemoryCursors;
  assistantHookContent?: string;
}

export interface SessionStateRepository {
  beginTurn(input: BeginSessionTurnInput): Promise<PreparedSessionTurn>;
  armTurnHook(
    turnId: string,
    payload: DurableMemoryTurnHookPayload,
  ): Promise<DurableTurnHookRecord>;
  completeTurn(
    input: CompleteSessionTurnInput,
  ): Promise<ProviderSessionBinding>;
  markProviderStarted(turnId: string): Promise<void>;
  rotatePendingTurn(turnId: string): Promise<PreparedSessionTurn>;
  invalidateBinding(
    conversationId: string,
    providerId: LocalAiProviderId,
    revision: number,
  ): Promise<void>;
  setConversationMemoryState(
    conversationId: string,
    state: { memoryVersion: number; memoryEpoch: number },
  ): Promise<ConversationSessionState>;
  branchConversation(
    sourceConversationId: string,
    targetConversationId: string,
  ): Promise<ConversationSessionState>;
  beginConversationDeletion(
    conversationId: string,
    forgetConversationMemory: boolean,
  ): Promise<ConversationDeletionRecord>;
  failConversationDeletion(
    conversationId: string,
    error: string,
  ): Promise<void>;
  completeConversationDeletion(
    conversationId: string,
  ): Promise<ConversationDeletionRecord>;
  getConversationDeletion(
    conversationId: string,
  ): Promise<ConversationDeletionRecord | undefined>;
  deleteConversation(conversationId: string): Promise<boolean>;
  resetProvider(
    conversationId: string,
    providerId: LocalAiProviderId,
  ): Promise<void>;
  rotateAllForMemoryContextChange(): Promise<number>;
  failTurn(
    turnId: string,
    status: Extract<SessionTurnStatus, "failed" | "aborted" | "uncertain">,
    error?: string,
  ): Promise<void>;
  listReplayableTurnHooks(now?: string): Promise<DurableTurnHookRecord[]>;
  acknowledgeTurnHook(hookId: string): Promise<boolean>;
  failTurnHook(
    hookId: string,
    error: string,
    retryable: boolean,
    pauseReason?: "configuration",
  ): Promise<void>;
  resetTurnHookRetries(pauseReason?: "configuration"): Promise<number>;
  getConversation(
    conversationId: string,
  ): Promise<ConversationSessionState | undefined>;
  getBindings(conversationId: string): Promise<ProviderSessionBinding[]>;
  getTurn(turnId: string): Promise<SessionTurnRecord | undefined>;
  getTurnRuntimeState(
    conversationId: string,
    turnId: string,
  ): Promise<LocalAITurnRuntimeState | undefined>;
  acknowledgeTurnPersistence(
    conversationId: string,
    turnId: string,
  ): Promise<boolean>;
  snapshot(): Promise<LocalAiRuntimeState>;
}

export class SessionStateError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "SessionStateError";
  }
}
