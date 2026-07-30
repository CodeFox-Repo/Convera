import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type { LanguageModel, ProviderMetadata } from "ai";
import type { AgentTool, AgentToolInteraction } from "./agent-tools";
import type { ProviderSessionBinding } from "./session/types";
import type { LocalAiProviderId, LocalAiProviderStatus } from "./types";

export function resolveLocalModelId(
  requestedModelId: string | undefined,
  defaultModelId: string,
): string {
  const requested = requestedModelId?.trim();
  return requested && requested !== "default" ? requested : defaultModelId;
}

export interface LocalAiProviderRun {
  model: LanguageModel;
  providerOptions?: Record<string, Record<string, unknown>>;
  getNativeSessionId(metadata: ProviderMetadata | undefined): string;
}

export interface LocalAiProviderRunContext {
  session?: ProviderSessionBinding;
  tools: AgentTool[];
  requestInteraction(
    interaction: AgentToolInteraction,
  ): Promise<{ approved?: boolean; value?: string }>;
}

export interface LocalAiProviderAdapter {
  readonly id: LocalAiProviderId;
  getStatus(): Promise<LocalAiProviderStatus>;
  prepareRun(
    request: LocalAIChatRequest,
    status: LocalAiProviderStatus,
    context: LocalAiProviderRunContext,
  ): Promise<LocalAiProviderRun>;
  dispose(): Promise<void>;
}
