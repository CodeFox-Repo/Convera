import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type { LanguageModel } from "ai";
import type {
  AgentTool,
  AgentToolInteraction,
  NativeMcpServer,
} from "./agent-tools";
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
    context: {
      tools: AgentTool[];
      nativeMcpServers: Record<
        string,
        NativeMcpServer & { toolNames: string[] }
      >;
      requestInteraction(
        interaction: AgentToolInteraction,
      ): Promise<{ approved?: boolean; value?: string }>;
    },
  ): Promise<LanguageModel>;
  dispose(): Promise<void>;
}
