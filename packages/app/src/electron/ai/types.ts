export const LOCAL_AI_PROVIDER_IDS = ["claude-code", "codex-cli"] as const;

export type LocalAiProviderId = (typeof LOCAL_AI_PROVIDER_IDS)[number];

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
