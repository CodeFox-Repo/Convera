import type { AgentSandbox } from "@/shared/types/workspace";
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

/**
 * Host-owned capability boundary for a provider turn. Unlike prompt
 * instructions, this policy is applied by the provider adapter before the
 * model sees its available tools.
 */
export type LocalAiProviderExecutionPolicy = "interactive" | "text-only";

export interface LocalAiProviderRunContext {
  session?: ProviderSessionBinding;
  tools: AgentTool[];
  executionPolicy?: LocalAiProviderExecutionPolicy;
  /** Always supplied by LocalAiRuntime; optional for direct adapter callers. */
  sandbox?: AgentSandbox;
  requestInteraction(
    interaction: AgentToolInteraction,
  ): Promise<{ approved?: boolean; value?: string }>;
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
  prepareRun(
    request: LocalAIChatRequest,
    status: LocalAiProviderStatus,
    context: LocalAiProviderRunContext,
  ): Promise<LocalAiProviderRun>;
  dispose(): Promise<void>;
}
