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

export interface LocalAIChatRequest {
  requestId: string;
  providerId: string;
  modelId?: string;
  messages: LocalAIMessage[];
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
  onEvent(
    requestId: string,
    callback: (event: LocalAIStreamEvent) => void,
  ): () => void;
}
