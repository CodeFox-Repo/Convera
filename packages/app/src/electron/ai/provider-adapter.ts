import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type { LanguageModel } from "ai";
import type { LocalAiProviderId, LocalAiProviderStatus } from "./types";

export function resolveLocalModelId(
  requestedModelId: string | undefined,
  defaultModelId: string,
): string {
  const requested = requestedModelId?.trim();
  return requested && requested !== "default" ? requested : defaultModelId;
}

export interface LocalAiProviderAdapter {
  readonly id: LocalAiProviderId;
  getStatus(): Promise<LocalAiProviderStatus>;
  createModel(
    request: LocalAIChatRequest,
    status: LocalAiProviderStatus,
  ): Promise<LanguageModel>;
  dispose(): Promise<void>;
}
