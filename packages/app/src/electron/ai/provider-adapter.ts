import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type { AgentSandbox } from "@/shared/types/workspace";
import type { LanguageModel } from "ai";
import type { AgentTool, AgentToolInteraction } from "./agent-tools";
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
  /**
   * True when the adapter pushes the boundary down to the process/OS, so an
   * escape is refused by the kernel. False means `resolveInSandbox` is the only
   * thing standing between the model and the rest of the disk.
   */
  readonly enforcesSandbox: boolean;
  getStatus(): Promise<LocalAiProviderStatus>;
  createModel(
    request: LocalAIChatRequest,
    status: LocalAiProviderStatus,
    context: {
      tools: AgentTool[];
      requestInteraction(
        interaction: AgentToolInteraction,
      ): Promise<{ approved?: boolean; value?: string }>;
      sandbox?: AgentSandbox;
    },
  ): Promise<LanguageModel>;
  dispose(): Promise<void>;
}
