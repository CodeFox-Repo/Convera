export const LOCAL_AI_PROVIDER_IDS = [
  "claude-code",
  "codex-cli",
  "openai-api",
  "fireworks-api",
] as const;

export type LocalAiProviderId = (typeof LOCAL_AI_PROVIDER_IDS)[number];

export function isLocalAiProviderId(value: string): value is LocalAiProviderId {
  return LOCAL_AI_PROVIDER_IDS.some((providerId) => providerId === value);
}

export interface LocalAiProviderDescriptor {
  id: LocalAiProviderId;
  label: string;
  defaultModel: string;
  models: string[];
  transport:
    | "claude-agent-sdk"
    | "codex-app-server"
    | "openai-api"
    | "fireworks-api";
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
