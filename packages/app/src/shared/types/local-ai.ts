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

export type LocalAIChatOperation =
  | {
      kind: "append";
      message: LocalAIMessage;
    }
  | {
      kind: "bootstrap";
      messages: LocalAIMessage[];
    }
  | {
      kind: "rebase";
      reason: "edit" | "regenerate";
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
    id?: string;
    systemPrompt?: string;
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
}

export interface LocalAIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export type LocalAIMemoryProvider = "off" | "letta";
export type LocalAISubconsciousProvider =
  | "off"
  | "codex-cli"
  | "claude-code"
  | "follow-active";
export type LocalAIMemorySchedule = "every-turn" | "batch" | "idle";

export interface LocalAIMemorySettings {
  provider: LocalAIMemoryProvider;
  baseURL: string;
  apiKeyConfigured: boolean;
  subconsciousProvider: LocalAISubconsciousProvider;
  schedule: LocalAIMemorySchedule;
  batchSize: number;
  idleDelayMs: number;
}

export interface LocalAIMemorySettingsUpdate {
  provider?: LocalAIMemoryProvider;
  baseURL?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  subconsciousProvider?: LocalAISubconsciousProvider;
  schedule?: LocalAIMemorySchedule;
  batchSize?: number;
  idleDelayMs?: number;
}

export interface LocalAIProviderBindingState {
  providerId: string;
  modelId?: string;
  revision: number;
  stale: boolean;
  updatedAt: string;
}

export interface LocalAIConversationRuntimeState {
  conversationId: string;
  revision: number;
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

export interface LocalAIDeleteConversationRequest {
  conversationId: string;
  forgetConversationMemory: boolean;
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
