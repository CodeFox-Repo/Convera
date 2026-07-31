import type { ILocalAIAPI, LocalAIProviderKind } from "@/shared/types/local-ai";

export type LocalAIProviderId = Extract<
  LocalAIProviderKind,
  "claude-code" | "codex-cli" | "openai-api"
>;

export const DEFAULT_LOCAL_AI_PROVIDER_ID: LocalAIProviderId = "claude-code";
export const DEFAULT_LOCAL_AI_MODEL_ID = "default";

export const LOCAL_AI_PROVIDER_NAMES: Record<LocalAIProviderId, string> = {
  "claude-code": "Claude Code",
  "codex-cli": "Codex",
  "openai-api": "OpenAI API",
};

export function isLocalAIProviderId(value: string): value is LocalAIProviderId {
  return Object.prototype.hasOwnProperty.call(LOCAL_AI_PROVIDER_NAMES, value);
}

export function getLocalAI(): ILocalAIAPI | undefined {
  return window.localAI;
}
