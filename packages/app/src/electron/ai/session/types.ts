import type { LocalAIChatOperation } from "@/shared/types/local-ai";
import type { LocalAiProviderId } from "../types";

export const LOCAL_AI_RUNTIME_STATE_SCHEMA_VERSION = 1 as const;

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
  status: SessionTurnStatus;
  startedAt: string;
  providerStartedAt?: string;
  completedAt?: string;
  nativeSessionId?: string;
  error?: string;
}

export interface ConversationSessionState {
  conversationId: string;
  revision: number;
  memoryEpoch: number;
  memoryVersion: number;
  updatedAt: string;
}

export interface LocalAiRuntimeStateV1 {
  schemaVersion: typeof LOCAL_AI_RUNTIME_STATE_SCHEMA_VERSION;
  conversations: ConversationSessionState[];
  bindings: ProviderSessionBinding[];
  turns: SessionTurnRecord[];
}

export interface BeginSessionTurnInput {
  turnId: string;
  requestId: string;
  conversationId: string;
  providerId: LocalAiProviderId;
  operation: LocalAIChatOperation["kind"];
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
  memoryCursors?: ProviderMemoryCursors;
}

export interface SessionStateRepository {
  beginTurn(input: BeginSessionTurnInput): Promise<PreparedSessionTurn>;
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
  getConversation(
    conversationId: string,
  ): Promise<ConversationSessionState | undefined>;
  getBindings(conversationId: string): Promise<ProviderSessionBinding[]>;
  getTurn(turnId: string): Promise<SessionTurnRecord | undefined>;
  snapshot(): Promise<LocalAiRuntimeStateV1>;
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
