import type {
  LocalAIChatRequest,
  LocalAIFinishReason,
  LocalAIInteractionResponse,
  LocalAIProviderAvailability,
  LocalAIProviderStatus,
  LocalAIRuntimeService,
  LocalAISerializableError,
  LocalAIStreamEvent,
  LocalAIUsage,
} from "@/shared/types/local-ai";
import {
  streamText,
  type LanguageModel,
  type ModelMessage,
  type UIMessageChunk,
} from "ai";
import { randomUUID } from "node:crypto";
import {
  createAgentToolCatalog,
  type AgentTool,
  type AgentToolGroup,
  type AgentToolInteraction,
} from "./agent-tools";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "./provider-descriptors";
import type { LocalAiProviderAdapter } from "./provider-adapter";
import { ClaudeCodeAdapter } from "./providers/claude-code";
import { CodexCliAdapter } from "./providers/codex-cli";
import {
  LOCAL_AI_PROVIDER_IDS,
  type LocalAiProviderId,
  type LocalAiProviderStatus as ProbeStatus,
} from "./types";

interface RuntimeStreamResult {
  toUIMessageStream(options?: {
    onError?: (error: unknown) => string;
    sendReasoning?: boolean;
    sendSources?: boolean;
  }): AsyncIterable<UIMessageChunk>;
  finishReason?: PromiseLike<unknown>;
  usage?: PromiseLike<unknown>;
}

interface RuntimeStreamOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  abortSignal: AbortSignal;
  maxOutputTokens?: number;
}

export type RuntimeStreamInvoker = (
  options: RuntimeStreamOptions,
) => RuntimeStreamResult;

export type AgentToolGroupProvider = () =>
  | AgentToolGroup[]
  | Promise<AgentToolGroup[]>;

export type AgentToolExecutor = (
  serverName: string,
  toolName: string,
  input: Record<string, unknown>,
) => Promise<unknown>;

const defaultStreamInvoker: RuntimeStreamInvoker = (options) =>
  streamText(options) as unknown as RuntimeStreamResult;

function isProviderId(providerId: string): providerId is LocalAiProviderId {
  return LOCAL_AI_PROVIDER_IDS.includes(providerId as LocalAiProviderId);
}

function availabilityFor(status: ProbeStatus): LocalAIProviderAvailability {
  if (!status.available) {
    return "missing";
  }
  if (!status.authenticated) {
    return "unauthenticated";
  }
  return "available";
}

function publicStatus(status: ProbeStatus): LocalAIProviderStatus {
  const detailParts = [status.detail];
  if (status.version) {
    detailParts.push(status.version);
  }

  return {
    id: status.id,
    name: status.label,
    kind: status.id,
    availability: availabilityFor(status),
    detail: detailParts.filter(Boolean).join(" · ") || undefined,
    models: status.models.map((model) => ({ id: model, name: model })),
  };
}

function missingProviderStatus(providerId: string): LocalAIProviderStatus {
  return {
    id: providerId,
    name: providerId,
    kind: "openai-compatible",
    availability: "unavailable",
    detail: `Unknown local AI provider: ${providerId}`,
  };
}

export function serializeLocalAiError(
  error: unknown,
  code?: string,
): LocalAISerializableError {
  if (error instanceof Error) {
    const errorWithCode = error as Error & { code?: unknown };
    return {
      name: error.name,
      message: error.message,
      code:
        code ??
        (typeof errorWithCode.code === "string"
          ? errorWithCode.code
          : undefined),
      stack: error.stack,
    };
  }

  return {
    name: "Error",
    message: typeof error === "string" ? error : JSON.stringify(error),
    code,
  };
}

function toMessages(request: LocalAIChatRequest): ModelMessage[] {
  const agentPrompt = request.agent?.systemPrompt?.trim();
  const messages: ModelMessage[] = request.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  if (agentPrompt) {
    messages.unshift({ role: "system", content: agentPrompt });
  }

  return messages;
}

function finishReason(reason: unknown): LocalAIFinishReason {
  switch (reason) {
    case "stop":
    case "length":
    case "content-filter":
    case "tool-calls":
    case "error":
      return reason;
    default:
      return "unknown";
  }
}

function usageFrom(value: unknown): LocalAIUsage | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const usage = value as Record<string, unknown>;
  const inputTokens =
    typeof usage.inputTokens === "number" ? usage.inputTokens : undefined;
  const outputTokens =
    typeof usage.outputTokens === "number" ? usage.outputTokens : undefined;
  const totalTokens =
    typeof usage.totalTokens === "number" ? usage.totalTokens : undefined;

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined
  ) {
    return undefined;
  }

  return { inputTokens, outputTokens, totalTokens };
}

interface PendingInteraction {
  requestId: string;
  resolve(response: LocalAIInteractionResponse): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
  abortSignal: AbortSignal;
  onAbort(): void;
}

export class LocalAiRuntime implements LocalAIRuntimeService {
  private readonly adapters = new Map<
    LocalAiProviderId,
    LocalAiProviderAdapter
  >();
  private readonly activeRequests = new Map<string, AbortController>();
  private readonly streamInvoker: RuntimeStreamInvoker;
  private readonly workingDirectory: string;
  private readonly getToolGroups: AgentToolGroupProvider;
  private readonly executeTool: AgentToolExecutor;
  private readonly pendingInteractions = new Map<string, PendingInteraction>();

  constructor(
    options: {
      adapters?: LocalAiProviderAdapter[];
      streamInvoker?: RuntimeStreamInvoker;
      workingDirectory?: string;
      getToolGroups?: AgentToolGroupProvider;
      executeTool?: AgentToolExecutor;
    } = {},
  ) {
    const adapters = options.adapters ?? [
      new ClaudeCodeAdapter(),
      new CodexCliAdapter(),
    ];
    this.streamInvoker = options.streamInvoker ?? defaultStreamInvoker;
    this.workingDirectory = options.workingDirectory ?? process.cwd();
    this.getToolGroups = options.getToolGroups ?? (() => []);
    this.executeTool =
      options.executeTool ??
      (async (serverName, toolName) => {
        throw new Error(
          `Tool executor is unavailable for ${serverName}:${toolName}.`,
        );
      });

    for (const adapter of adapters) {
      this.adapters.set(adapter.id, adapter);
    }
  }

  async listProviders(): Promise<LocalAIProviderStatus[]> {
    return Promise.all(
      LOCAL_AI_PROVIDER_IDS.map((providerId) =>
        this.getProviderStatus(providerId),
      ),
    );
  }

  async getProviderStatus(providerId: string): Promise<LocalAIProviderStatus> {
    if (!isProviderId(providerId)) {
      return missingProviderStatus(providerId);
    }

    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      const descriptor = LOCAL_AI_PROVIDER_DESCRIPTORS[providerId];
      return {
        id: providerId,
        name: descriptor.label,
        kind: providerId,
        availability: "unavailable",
        detail: `${descriptor.label} adapter is not configured.`,
        models: descriptor.models.map((model) => ({
          id: model,
          name: model,
        })),
      };
    }

    try {
      return publicStatus(await adapter.getStatus());
    } catch (error) {
      return {
        id: providerId,
        name: LOCAL_AI_PROVIDER_DESCRIPTORS[providerId].label,
        kind: providerId,
        availability: "error",
        detail: serializeLocalAiError(error).message,
      };
    }
  }

  async startChat(
    request: LocalAIChatRequest,
    emit: (event: LocalAIStreamEvent) => void,
  ): Promise<void> {
    if (this.activeRequests.has(request.requestId)) {
      this.emitFailure(
        request.requestId,
        emit,
        new Error(`Request is already active: ${request.requestId}`),
        "DUPLICATE_REQUEST",
      );
      return;
    }

    if (!isProviderId(request.providerId)) {
      this.emitFailure(
        request.requestId,
        emit,
        new Error(`Unknown local AI provider: ${request.providerId}`),
        "UNKNOWN_PROVIDER",
      );
      return;
    }

    if (request.messages.length === 0) {
      this.emitFailure(
        request.requestId,
        emit,
        new Error("At least one chat message is required."),
        "EMPTY_MESSAGES",
      );
      return;
    }

    const adapter = this.adapters.get(request.providerId);
    if (!adapter) {
      this.emitFailure(
        request.requestId,
        emit,
        new Error(`Provider adapter is unavailable: ${request.providerId}`),
        "PROVIDER_UNAVAILABLE",
      );
      return;
    }

    const controller = new AbortController();
    this.activeRequests.set(request.requestId, controller);

    try {
      const probeStatus = await adapter.getStatus();
      controller.signal.throwIfAborted();
      if (!probeStatus.available || !probeStatus.authenticated) {
        this.emitFailure(
          request.requestId,
          emit,
          new Error(
            probeStatus.detail ??
              `${probeStatus.label} is unavailable or unauthenticated.`,
          ),
          probeStatus.available
            ? "PROVIDER_UNAUTHENTICATED"
            : "PROVIDER_MISSING",
        );
        return;
      }

      // Renderer input must not expand filesystem scope. Main chooses a single
      // trusted working directory when constructing the runtime.
      const trustedRequest: LocalAIChatRequest = {
        ...request,
        options: {
          ...request.options,
          cwd: this.workingDirectory,
        },
      };
      const requestInteraction = (interaction: AgentToolInteraction) =>
        this.requestInteraction(
          request.requestId,
          interaction,
          controller.signal,
          emit,
        );
      const toolGroups = await this.getToolGroups();
      controller.signal.throwIfAborted();
      const nativeMcpServers = Object.fromEntries(
        toolGroups.flatMap((group) =>
          group.nativeMcpServer
            ? [
                [
                  group.serverName,
                  {
                    ...group.nativeMcpServer,
                    toolNames: group.tools.map((tool) => tool.name),
                  },
                ],
              ]
            : [],
        ),
      );
      const tools = createAgentToolCatalog({
        groups: toolGroups.filter((group) => !group.nativeMcpServer),
        executeTool: this.executeTool,
        requestInteraction,
      });
      const model = await adapter.createModel(trustedRequest, probeStatus, {
        tools,
        nativeMcpServers,
        requestInteraction,
      });
      controller.signal.throwIfAborted();
      const result = this.streamInvoker({
        model,
        messages: toMessages(request),
        abortSignal: controller.signal,
        maxOutputTokens: request.options?.maxOutputTokens,
      });
      await this.forwardStream(
        request.requestId,
        result,
        controller,
        emit,
        tools,
      );
    } catch (error) {
      if (controller.signal.aborted) {
        emit({
          type: "finish",
          requestId: request.requestId,
          finishReason: "aborted",
        });
      } else {
        this.emitFailure(request.requestId, emit, error);
      }
    } finally {
      this.rejectRequestInteractions(
        request.requestId,
        new Error(
          "Local AI request finished before the interaction completed.",
        ),
      );
      this.activeRequests.delete(request.requestId);
    }
  }

  abort(requestId: string): boolean {
    const controller = this.activeRequests.get(requestId);
    if (!controller) {
      return false;
    }

    controller.abort();
    return true;
  }

  respondToInteraction(
    requestId: string,
    interactionId: string,
    response: LocalAIInteractionResponse,
  ): boolean {
    const pending = this.pendingInteractions.get(interactionId);
    if (!pending || pending.requestId !== requestId) return false;

    this.releaseInteraction(interactionId, pending);
    pending.resolve(response);
    return true;
  }

  async dispose(): Promise<void> {
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();
    for (const [interactionId, pending] of this.pendingInteractions) {
      this.releaseInteraction(interactionId, pending);
      pending.reject(new Error("Local AI runtime disposed."));
    }

    await Promise.all(
      [...this.adapters.values()].map((adapter) => adapter.dispose()),
    );
  }

  private async forwardStream(
    requestId: string,
    result: RuntimeStreamResult,
    controller: AbortController,
    emit: (event: LocalAIStreamEvent) => void,
    tools: AgentTool[],
  ): Promise<void> {
    const eventNames = new Map(
      tools.map((tool) => [tool.name, tool.qualifiedName]),
    );
    let streamedFinishReason: LocalAIFinishReason = "unknown";

    for await (const chunk of result.toUIMessageStream({
      onError: (error) => serializeLocalAiError(error).message,
    })) {
      const qualifiedChunk = this.qualifyToolChunk(chunk, eventNames);
      if (qualifiedChunk.type === "finish") {
        streamedFinishReason = finishReason(qualifiedChunk.finishReason);
      } else if (qualifiedChunk.type === "error") {
        streamedFinishReason = "error";
      }
      emit({ type: "ui-message", requestId, chunk: qualifiedChunk });
    }

    const resolvedFinishReason = result.finishReason
      ? finishReason(await result.finishReason)
      : streamedFinishReason;
    const usage = result.usage ? usageFrom(await result.usage) : undefined;
    emit({
      type: "finish",
      requestId,
      finishReason: controller.signal.aborted
        ? "aborted"
        : resolvedFinishReason,
      usage,
    });
  }

  private emitFailure(
    requestId: string,
    emit: (event: LocalAIStreamEvent) => void,
    error: unknown,
    code?: string,
  ): void {
    emit({
      type: "error",
      requestId,
      error: serializeLocalAiError(error, code),
    });
    emit({ type: "finish", requestId, finishReason: "error" });
  }

  private requestInteraction(
    requestId: string,
    interaction: AgentToolInteraction,
    abortSignal: AbortSignal,
    emit: (event: LocalAIStreamEvent) => void,
  ): Promise<LocalAIInteractionResponse> {
    const interactionId = randomUUID();

    return new Promise((resolve, reject) => {
      if (abortSignal.aborted) {
        reject(new Error(`Interaction cancelled for ${interaction.name}.`));
        return;
      }

      const onAbort = () => {
        const pending = this.pendingInteractions.get(interactionId);
        if (!pending) return;
        this.releaseInteraction(interactionId, pending);
        reject(new Error(`Interaction cancelled for ${interaction.name}.`));
      };
      const timeout = setTimeout(() => {
        const pending = this.pendingInteractions.get(interactionId);
        if (!pending) return;
        this.releaseInteraction(interactionId, pending);
        reject(new Error(`Interaction timed out for ${interaction.name}.`));
      }, 5 * 60_000);

      this.pendingInteractions.set(interactionId, {
        requestId,
        resolve,
        reject,
        timeout,
        abortSignal,
        onAbort,
      });
      abortSignal.addEventListener("abort", onAbort, { once: true });
      emit({
        type: "interaction",
        requestId,
        interactionId,
        ...interaction,
      });
    });
  }

  private rejectRequestInteractions(requestId: string, error: Error): void {
    for (const [interactionId, pending] of this.pendingInteractions) {
      if (pending.requestId !== requestId) continue;
      this.releaseInteraction(interactionId, pending);
      pending.reject(error);
    }
  }

  private releaseInteraction(
    interactionId: string,
    pending: PendingInteraction,
  ): void {
    clearTimeout(pending.timeout);
    pending.abortSignal.removeEventListener("abort", pending.onAbort);
    this.pendingInteractions.delete(interactionId);
  }

  private toolEventName(
    providerName: string,
    eventNames: Map<string, string>,
  ): string {
    for (const [alias, qualifiedName] of eventNames) {
      if (
        providerName === alias ||
        providerName.endsWith(`__${alias}`) ||
        providerName.endsWith(`.${alias}`)
      ) {
        return qualifiedName;
      }
    }
    return providerName;
  }

  private qualifyToolChunk(
    chunk: UIMessageChunk,
    eventNames: Map<string, string>,
  ): UIMessageChunk {
    switch (chunk.type) {
      case "tool-input-start":
      case "tool-input-available":
      case "tool-input-error":
        return {
          ...chunk,
          toolName: this.toolEventName(chunk.toolName, eventNames),
        };
      default:
        return chunk;
    }
  }
}
