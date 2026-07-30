export type LocalAIProviderId =
  | "claude-code"
  | "codex-cli"
  | "openai-compatible";

export const DEFAULT_LOCAL_AI_PROVIDER_ID: LocalAIProviderId = "claude-code";
export const DEFAULT_LOCAL_AI_MODEL_ID = "default";

export const LOCAL_AI_PROVIDER_NAMES: Record<LocalAIProviderId, string> = {
  "claude-code": "Claude Code",
  "codex-cli": "Codex",
  "openai-compatible": "OpenAI-compatible",
};

export function isLocalAIProviderId(value: string): value is LocalAIProviderId {
  return Object.prototype.hasOwnProperty.call(LOCAL_AI_PROVIDER_NAMES, value);
}

export interface LocalAIProviderStatus {
  id: LocalAIProviderId;
  name: string;
  available: boolean;
  authenticated: boolean;
  models?: string[];
  error?: string;
}

export interface LocalAIMessage {
  id?: string;
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LocalAIChatRequest {
  requestId: string;
  providerId: LocalAIProviderId;
  model?: string;
  messages: LocalAIMessage[];
  agent?: {
    id?: string;
    systemPrompt?: string;
  };
  options?: Record<string, unknown>;
}

export interface LocalAIError {
  name: string;
  message: string;
  code?: string;
  stack?: string;
}

export type LocalAIChatEvent =
  | {
      type: "delta";
      requestId: string;
      text: string;
    }
  | {
      type: "tool";
      requestId: string;
      toolCallId: string;
      name: string;
      state:
        | "input-streaming"
        | "input-available"
        | "output-available"
        | "output-error";
      input?: unknown;
      output?: unknown;
      error?: string;
    }
  | {
      type: "error";
      requestId: string;
      error: LocalAIError;
    }
  | {
      type: "finish";
      requestId: string;
      finishReason:
        | "stop"
        | "length"
        | "content-filter"
        | "tool-calls"
        | "error"
        | "aborted"
        | "unknown";
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      };
    };

export interface LocalAIResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface LocalAIStartResult extends LocalAIResult<never> {
  accepted: boolean;
  requestId: string;
}

export interface LocalAIAPI {
  listProviders(): Promise<LocalAIResult<LocalAIProviderStatus[]>>;
  getProviderStatus(
    id: LocalAIProviderId,
  ): Promise<LocalAIResult<LocalAIProviderStatus>>;
  startChat(request: LocalAIChatRequest): Promise<LocalAIStartResult>;
  abort(requestId: string): Promise<LocalAIResult<{ aborted: boolean }>>;
  onEvent(
    requestId: string,
    callback: (event: LocalAIChatEvent) => void,
  ): () => void;
}

// Temporary renderer-only bridge declaration. Replace it with the shared preload type during integration.
export function getLocalAI(): LocalAIAPI | undefined {
  return (window as Window & { localAI?: LocalAIAPI }).localAI;
}
