import { LocalAiProviderDescriptor, LocalAiProviderId } from "./types";

export const LOCAL_AI_PROVIDER_DESCRIPTORS: Record<
  LocalAiProviderId,
  LocalAiProviderDescriptor
> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    defaultModel: "sonnet",
    models: ["sonnet", "opus", "haiku"],
    transport: "claude-agent-sdk",
    supportsStreaming: true,
  },
  "openai-api": {
    id: "openai-api",
    label: "OpenAI API",
    // Luna is the nano-tier of the 5.6 family ($0.2/$1.2) — the only model this
    // provider offers, so tests and daily driving can never pick an expensive one.
    defaultModel: "gpt-5.6-luna",
    models: ["gpt-5.6-luna"],
    transport: "openai-api",
    supportsStreaming: true,
  },
  "codex-cli": {
    id: "codex-cli",
    label: "Codex",
    defaultModel: "gpt-5.3-codex",
    models: ["gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.2-codex-mini"],
    transport: "codex-app-server",
    supportsStreaming: true,
  },
};
