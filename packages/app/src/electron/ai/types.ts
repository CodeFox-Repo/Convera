export const LOCAL_AI_PROVIDER_IDS = ["claude-code", "codex-cli"] as const;

export type LocalAiProviderId = (typeof LOCAL_AI_PROVIDER_IDS)[number];

export type LocalChatRole = "system" | "user" | "assistant";

export interface LocalChatMessage {
  id?: string;
  role: LocalChatRole;
  content: string;
}

export interface LocalChatAgent {
  systemPrompt?: string;
}

export interface LocalChatOptions {
  cwd?: string;
  maxOutputTokens?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

export interface LocalChatRequest {
  requestId: string;
  providerId: LocalAiProviderId;
  model?: string;
  messages: LocalChatMessage[];
  agent?: LocalChatAgent | string;
  options?: LocalChatOptions;
}

export interface LocalAiProviderDescriptor {
  id: LocalAiProviderId;
  label: string;
  defaultModel: string;
  models: string[];
  transport: "claude-agent-sdk" | "codex-app-server";
  supportsStreaming: true;
}

export interface LocalAiProviderStatus extends LocalAiProviderDescriptor {
  available: boolean;
  authenticated: boolean;
  version?: string;
  executablePath?: string;
  detail?: string;
  checkedAt: string;
}

export type LocalAiToolPhase =
  | "input-start"
  | "input-delta"
  | "call"
  | "result"
  | "error";

export interface LocalAiToolEvent {
  type: "tool";
  requestId: string;
  phase: LocalAiToolPhase;
  toolCallId?: string;
  toolName?: string;
  delta?: string;
  input?: unknown;
  output?: unknown;
}

export type LocalAiEvent =
  | {
      type: "delta";
      requestId: string;
      delta: string;
    }
  | LocalAiToolEvent
  | {
      type: "error";
      requestId: string;
      message: string;
      code?: string;
      recoverable: boolean;
    }
  | {
      type: "finish";
      requestId: string;
      finishReason?: string;
      usage?: unknown;
      aborted: boolean;
    };

export type LocalAiEventEmitter = (event: LocalAiEvent) => void | Promise<void>;

export interface LocalAiService {
  listProviders(): Promise<LocalAiProviderStatus[]>;
  getProviderStatus(
    providerId: LocalAiProviderId,
  ): Promise<LocalAiProviderStatus>;
  startChat(
    request: LocalChatRequest,
    emit: LocalAiEventEmitter,
  ): Promise<void>;
  abort(requestId: string): boolean;
  dispose(): Promise<void>;
}
