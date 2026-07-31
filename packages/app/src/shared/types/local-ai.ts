/**
 * Structured-clone-safe contracts shared by Electron main, preload, and
 * renderer. Runtime implementations must not put Error instances, functions,
 * or other process-owned objects on this boundary.
 */

import type { UIMessageChunk } from "ai";

export type LocalAIProviderKind =
  | "claude-code"
  | "codex-cli"
  | "openai-compatible";

export type LocalAIProviderAvailability =
  | "available"
  | "missing"
  | "unauthenticated"
  | "unavailable"
  | "error";

export interface LocalAIProviderStatus {
  id: string;
  name: string;
  kind: LocalAIProviderKind;
  availability: LocalAIProviderAvailability;
  detail?: string;
  models?: Array<{
    id: string;
    name: string;
  }>;
}

export type LocalAIMessageRole = "system" | "user" | "assistant";

export interface LocalAIMessage {
  id?: string;
  role: LocalAIMessageRole;
  content: string;
}

export type LocalAIRebaseReason = "edit" | "regenerate" | "provider-switch";

export type LocalAIChatOperation =
  | {
      kind: "append";
      message: LocalAIMessage;
      /**
       * Bounded visible transcript used only when main must rotate away from
       * a provider-native session after request admission. Ordinary resume
       * paths still send only `message` to the provider.
       */
      recoveryMessages?: LocalAIMessage[];
    }
  | {
      kind: "bootstrap";
      messages: LocalAIMessage[];
    }
  | {
      kind: "rebase";
      reason: LocalAIRebaseReason;
      sourceMessageId?: string;
      messages: LocalAIMessage[];
    };

export interface LocalAIChatRequest {
  requestId: string;
  conversationId: string;
  turnId: string;
  /**
   * An optimistic concurrency cursor only. Electron main owns the authoritative
   * revision and rejects stale renderer work.
   */
  expectedRevision?: number;
  providerId: string;
  modelId?: string;
  operation: LocalAIChatOperation;
  agent?: {
    /** Stable agent entity id. */
    id?: string;
    /** Stable channel participant id used to isolate native sessions. */
    memberId?: string;
    systemPrompt?: string;
  };
  /**
   * Main-process Agent Host context. The renderer may propose these opaque ids,
   * but every channel tool revalidates membership and injects `agentMemberId`
   * as the author before touching channel state.
   */
  agentHost?: {
    jobId: string;
    channelId: string;
    conversationId: string;
    triggerMessageId: string;
    agentMemberId: string;
    chain: {
      hops: number;
      invoked: string[];
    };
  };
  options?: {
    temperature?: number;
    maxOutputTokens?: number;
    cwd?: string;
  };
}

export interface LocalAISerializableError {
  name: string;
  message: string;
  code?: string;
  stack?: string;
  retryable?: boolean;
}

export interface LocalAIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export const LOCAL_AI_MEMORY_PROVIDERS = ["off", "local"] as const;
export type LocalAIMemoryProvider = (typeof LOCAL_AI_MEMORY_PROVIDERS)[number];

export function isLocalAIMemoryProvider(
  value: string,
): value is LocalAIMemoryProvider {
  return LOCAL_AI_MEMORY_PROVIDERS.some((provider) => provider === value);
}
export type LocalAISubconsciousProvider =
  | "off"
  | "codex-cli"
  | "claude-code"
  | "follow-active";
export type LocalAIMemorySchedule = "every-turn" | "batch" | "idle";

export interface LocalAIMemorySettings {
  provider: LocalAIMemoryProvider;
  subconsciousProvider: LocalAISubconsciousProvider;
  schedule: LocalAIMemorySchedule;
  batchSize: number;
  idleDelayMs: number;
}

export interface LocalAIMemorySettingsUpdate {
  provider?: LocalAIMemoryProvider;
  subconsciousProvider?: LocalAISubconsciousProvider;
  schedule?: LocalAIMemorySchedule;
  batchSize?: number;
  idleDelayMs?: number;
}

export interface LocalAIProviderBindingState {
  actorId: string;
  providerId: string;
  modelId?: string;
  revision: number;
  transcriptVersion: number;
  stale: boolean;
  updatedAt: string;
}

export interface LocalAIConversationRuntimeState {
  conversationId: string;
  revision: number;
  transcriptVersion: number;
  lastCompletedProviderId?: string;
  memoryEpoch: number;
  memoryVersion: number;
  providers: LocalAIProviderBindingState[];
}

export type LocalAIMemoryHealth =
  | "disabled"
  | "healthy"
  | "degraded"
  | "offline"
  | "error";

export interface LocalAIMemoryStatus {
  health: LocalAIMemoryHealth;
  detail?: string;
  memoryVersion?: number;
  pendingJobs: number;
  failedJobs: number;
  lastSuccessfulSyncAt?: string;
}

export interface LocalAIBranchConversationRequest {
  sourceConversationId: string;
  targetConversationId: string;
  throughMessageId?: string;
  bootstrapMessages: LocalAIMessage[];
}

export interface LocalAIConversationLeaseRequest {
  conversationId: string;
  leaseToken: string;
}

export type LocalAITurnPersistenceStatus =
  | "pending"
  | "completed"
  | "failed"
  | "aborted"
  | "uncertain"
  | "interrupted";

export interface LocalAITurnRuntimeStateRequest {
  conversationId: string;
  turnId: string;
}

export interface LocalAITurnRuntimeState {
  conversationId: string;
  turnId: string;
  requestId: string;
  providerId: string;
  modelId?: string;
  revision: number;
  status: LocalAITurnPersistenceStatus;
  startedAt: string;
  completedAt?: string;
  finishReason?: LocalAIFinishReason;
  assistantText?: string;
  assistantTextTruncated?: boolean;
  error?: string;
  rendererPersistedAt?: string;
}

export interface LocalAIDeleteConversationRequest {
  conversationId: string;
  forgetConversationMemory: boolean;
  leaseToken: string;
  /**
   * Stable main-process idempotency key. Renderer callers omit this; the
   * runtime supplies it from its durable deletion record before memory I/O.
   */
  operationId?: string;
}

export interface LocalAIResetProviderSessionRequest {
  conversationId: string;
  providerId: string;
}

export type LocalAIInteractionKind = "approval" | "input";

export interface LocalAIInteractionResponse {
  approved?: boolean;
  value?: string;
}

export type LocalAIFinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "aborted"
  | "unknown";

export type LocalAIStreamEvent =
  | {
      type: "ui-message";
      requestId: string;
      chunk: UIMessageChunk;
    }
  | {
      type: "error";
      requestId: string;
      error: LocalAISerializableError;
    }
  | {
      type: "interaction";
      requestId: string;
      interactionId: string;
      kind: LocalAIInteractionKind;
      name: string;
      prompt: string;
      input?: unknown;
      options?: string[];
    }
  | {
      type: "finish";
      requestId: string;
      finishReason: LocalAIFinishReason;
      usage?: LocalAIUsage;
      conversationId?: string;
      turnId?: string;
      revision?: number;
    };

export interface LocalAIResult<T> {
  success: boolean;
  data?: T;
  error?: LocalAISerializableError;
}

export interface LocalAIStartResult extends LocalAIResult<never> {
  accepted: boolean;
}

export interface LocalAIRuntimeService {
  listProviders(): Promise<LocalAIProviderStatus[]> | LocalAIProviderStatus[];
  getProviderStatus(
    providerId: string,
  ): Promise<LocalAIProviderStatus> | LocalAIProviderStatus;
  startChat(
    request: LocalAIChatRequest,
    emit: (event: LocalAIStreamEvent) => void,
  ): Promise<void> | void;
  abort(requestId: string): Promise<boolean> | boolean;
  respondToInteraction(
    requestId: string,
    interactionId: string,
    response: LocalAIInteractionResponse,
  ): Promise<boolean> | boolean;
  getConversationRuntimeState(
    conversationId: string,
  ):
    | Promise<LocalAIConversationRuntimeState | null>
    | LocalAIConversationRuntimeState
    | null;
  quiesceConversation(conversationId: string): Promise<string> | string;
  resumeConversation(
    conversationId: string,
    leaseToken: string,
  ): Promise<boolean> | boolean;
  getTurnRuntimeState(
    request: LocalAITurnRuntimeStateRequest,
  ): Promise<LocalAITurnRuntimeState | null> | LocalAITurnRuntimeState | null;
  acknowledgeTurnPersistence(
    request: LocalAITurnRuntimeStateRequest,
  ): Promise<boolean> | boolean;
  branchConversation(
    request: LocalAIBranchConversationRequest,
  ): Promise<LocalAIConversationRuntimeState> | LocalAIConversationRuntimeState;
  deleteConversation(
    request: LocalAIDeleteConversationRequest,
  ): Promise<boolean> | boolean;
  resetConversationProviderSession(
    request: LocalAIResetProviderSessionRequest,
  ): Promise<LocalAIConversationRuntimeState> | LocalAIConversationRuntimeState;
  getMemorySettings(): Promise<LocalAIMemorySettings> | LocalAIMemorySettings;
  updateMemorySettings(
    update: LocalAIMemorySettingsUpdate,
  ): Promise<LocalAIMemorySettings> | LocalAIMemorySettings;
  getMemoryStatus(
    conversationId?: string,
  ): Promise<LocalAIMemoryStatus> | LocalAIMemoryStatus;
}

export interface ILocalAIAPI {
  listProviders(): Promise<LocalAIResult<LocalAIProviderStatus[]>>;
  getProviderStatus(
    providerId: string,
  ): Promise<LocalAIResult<LocalAIProviderStatus>>;
  startChat(request: LocalAIChatRequest): Promise<LocalAIStartResult>;
  abort(requestId: string): Promise<LocalAIResult<{ aborted: boolean }>>;
  respondToInteraction(
    requestId: string,
    interactionId: string,
    response: LocalAIInteractionResponse,
  ): Promise<LocalAIResult<{ accepted: boolean }>>;
  getConversationRuntimeState(
    conversationId: string,
  ): Promise<LocalAIResult<LocalAIConversationRuntimeState | null>>;
  quiesceConversation(
    conversationId: string,
  ): Promise<LocalAIResult<{ quiesced: true; leaseToken: string }>>;
  resumeConversation(
    request: LocalAIConversationLeaseRequest,
  ): Promise<LocalAIResult<{ resumed: boolean }>>;
  getTurnRuntimeState(
    request: LocalAITurnRuntimeStateRequest,
  ): Promise<LocalAIResult<LocalAITurnRuntimeState | null>>;
  acknowledgeTurnPersistence(
    request: LocalAITurnRuntimeStateRequest,
  ): Promise<LocalAIResult<{ acknowledged: boolean }>>;
  branchConversation(
    request: LocalAIBranchConversationRequest,
  ): Promise<LocalAIResult<LocalAIConversationRuntimeState>>;
  deleteConversation(
    request: LocalAIDeleteConversationRequest,
  ): Promise<LocalAIResult<{ deleted: boolean }>>;
  resetConversationProviderSession(
    request: LocalAIResetProviderSessionRequest,
  ): Promise<LocalAIResult<LocalAIConversationRuntimeState>>;
  getMemorySettings(): Promise<LocalAIResult<LocalAIMemorySettings>>;
  updateMemorySettings(
    update: LocalAIMemorySettingsUpdate,
  ): Promise<LocalAIResult<LocalAIMemorySettings>>;
  getMemoryStatus(
    conversationId?: string,
  ): Promise<LocalAIResult<LocalAIMemoryStatus>>;
  onEvent(
    requestId: string,
    callback: (event: LocalAIStreamEvent) => void,
  ): () => void;
}
