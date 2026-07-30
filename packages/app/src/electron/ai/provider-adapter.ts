import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type { LanguageModel } from "ai";
import type { LocalAiProviderId, LocalAiProviderStatus } from "./types";

export interface LocalAiProviderAdapter {
  readonly id: LocalAiProviderId;
  getStatus(): Promise<LocalAiProviderStatus>;
  createModel(
    request: LocalAIChatRequest,
    status: LocalAiProviderStatus,
  ): Promise<LanguageModel>;
  dispose(): Promise<void>;
}
