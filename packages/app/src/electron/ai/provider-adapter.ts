import type { AgentSandbox } from "@/shared/types/workspace";
import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type {
  PiModel,
  PiStreamOptions,
  PiThinkingLevel,
} from "./pi-agent-types";
import type { LanguageModel, ProviderMetadata, ToolSet } from "ai";
import type {
  AgentTool,
  AgentToolInteraction,
  NativeMcpServer,
} from "./agent-tools";
import type { ProviderSessionBinding } from "./session/types";
import type { LocalAiProviderId, LocalAiProviderStatus } from "./types";

export function resolveLocalModelId(
  requestedModelId: string | undefined,
  defaultModelId: string,
): string {
  const requested = requestedModelId?.trim();
  return requested && requested !== "default" ? requested : defaultModelId;
}

export interface LocalAiAiSdkProviderRun {
  executionEngine?: "ai-sdk";
  model: LanguageModel;
  providerOptions?: Record<string, Record<string, unknown>>;
  /**
   * Tools handed to `streamText` rather than wired into the provider itself.
   * Only adapters without their own tool transport (a plain HTTP API) use this;
   * the CLI adapters expose tools through their own MCP bridge.
   */
  tools?: ToolSet;
  getNativeSessionId(metadata: ProviderMetadata | undefined): string;
}

export interface LocalAiPiProviderRun {
  executionEngine: "pi-agent-core";
  model: PiModel;
  apiKey: string;
  fetch?: PiStreamOptions["fetch"];
  reasoning?: PiThinkingLevel;
  onPayload?: PiStreamOptions["onPayload"];
  providerOptions?: undefined;
  tools?: undefined;
  getNativeSessionId(metadata: ProviderMetadata | undefined): string;
}

export type LocalAiProviderRun = LocalAiAiSdkProviderRun | LocalAiPiProviderRun;

export function isPiProviderRun(
  run: LocalAiProviderRun,
): run is LocalAiPiProviderRun {
  return run.executionEngine === "pi-agent-core";
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
  nativeMcpServers?: Readonly<
    Record<string, NativeMcpServer & { toolNames: string[] }>
  >;
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
  /**
   * Whether a persisted provider binding owns enough conversation history for
   * the next append to send only its newest message. Stateless HTTP providers
   * set this to false so the runtime replays the bounded recovery transcript.
   *
   * Optional so native-session adapters keep their existing behaviour; absent
   * reads as true.
   */
  readonly resumesNativeSession?: boolean;
  /**
   * True when the provider already gives the model file and shell access of its
   * own (both CLI adapters do). False means the runtime must supply the basic
   * read/write/list floor, or the agent would have no hands at all — no way to
   * keep the memory file the colleague model assumes it can keep.
   *
   * Optional so existing adapters keep their behaviour; absent reads as true.
   */
  readonly providesOwnTools?: boolean;
  getStatus(): Promise<LocalAiProviderStatus>;
  prepareRun(
    request: LocalAIChatRequest,
    status: LocalAiProviderStatus,
    context: LocalAiProviderRunContext,
  ): Promise<LocalAiProviderRun>;
  dispose(): Promise<void>;
}
