import type {
  LocalAIBranchConversationRequest,
  LocalAIChatRequest,
  LocalAIConversationRuntimeState,
  LocalAIDeleteConversationRequest,
  LocalAIFinishReason,
  LocalAIInteractionResponse,
  LocalAIMemorySettings,
  LocalAIMemorySettingsUpdate,
  LocalAIMemoryStatus,
  LocalAIProviderAvailability,
  LocalAIProviderStatus,
  LocalAIResetProviderSessionRequest,
  LocalAIRuntimeService,
  LocalAISerializableError,
  LocalAIStreamEvent,
  LocalAIUsage,
} from "@/shared/types/local-ai";
import {
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ProviderMetadata,
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
  defaultSessionStatePath,
  JsonSessionStateRepository,
} from "./session/repository";
import { KeyedSerialExecutor } from "./session/serial-executor";
import type {
  PreparedSessionTurn,
  ProviderMemoryCursors,
  ProviderSessionBinding,
  SessionStateRepository,
} from "./session/types";
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
  providerMetadata?: PromiseLike<ProviderMetadata | undefined>;
}

interface RuntimeStreamOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  abortSignal: AbortSignal;
  maxOutputTokens?: number;
  providerOptions?: Record<string, Record<string, unknown>>;
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
  streamText(
    options as Parameters<typeof streamText>[0],
  ) as unknown as RuntimeStreamResult;

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

function toMessages(
  request: LocalAIChatRequest,
  resumesNativeSession: boolean,
  systemContext?: string,
): ModelMessage[] {
  const agentPrompt = request.agent?.systemPrompt?.trim();
  const turnContext = systemContext?.trim();
  const operationMessages =
    request.operation.kind === "append"
      ? [request.operation.message]
      : request.operation.messages;
  const messages: ModelMessage[] = operationMessages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  if (agentPrompt && !resumesNativeSession) {
    messages.unshift({ role: "system", content: agentPrompt });
  }
  if (turnContext) {
    const insertionIndex = messages[0]?.role === "system" ? 1 : 0;
    messages.splice(insertionIndex, 0, {
      role: "system",
      content: turnContext,
    });
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

interface ForwardedStream {
  finishReason: LocalAIFinishReason;
  usage?: LocalAIUsage;
  providerMetadata?: ProviderMetadata;
  finishChunk?: UIMessageChunk;
  assistantText: string;
}

export interface PreparedLocalAiTurnContext {
  /**
   * Ephemeral context for this turn. It is never written to the renderer
   * transcript and is injected even when a native provider session resumes.
   */
  systemContext?: string;
  additionalTools?: AgentTool[];
  /**
   * Opaque state returned to the completion/failure hooks. The runtime never
   * persists or interprets this value.
   */
  contextToken?: unknown;
  /**
   * Rotate away from an existing provider-native session before sending.
   * The pending turn is moved to a new revision so stale hidden context can
   * never be resumed accidentally.
   */
  forceNewSession?: boolean;
  /**
   * Persisted atomically with the provider-native session id after success.
   * Failed or uncertain turns do not advance these cursors.
   */
  memoryCursors?: ProviderMemoryCursors;
}

export interface LocalAiTurnHookInput {
  request: LocalAIChatRequest;
  prepared: PreparedSessionTurn;
  requestInteraction(
    interaction: AgentToolInteraction,
  ): Promise<LocalAIInteractionResponse>;
}

export interface LocalAiCompletedTurn {
  request: LocalAIChatRequest;
  revision: number;
  assistantText: string;
  binding: ProviderSessionBinding;
  contextToken?: unknown;
}

export interface LocalAiFailedTurn {
  request: LocalAIChatRequest;
  revision?: number;
  error: LocalAISerializableError;
  providerMayHaveAdvanced: boolean;
  contextToken?: unknown;
}

export interface LocalAiTurnHooks {
  prepareTurnContext?(
    input: LocalAiTurnHookInput,
  ):
    | Promise<PreparedLocalAiTurnContext | undefined>
    | PreparedLocalAiTurnContext
    | undefined;
  onTurnCompleted?(input: LocalAiCompletedTurn): Promise<void> | void;
  onTurnFailed?(input: LocalAiFailedTurn): Promise<void> | void;
}

export interface LocalAiMemoryRuntimeService {
  getMemorySettings(): Promise<LocalAIMemorySettings> | LocalAIMemorySettings;
  updateMemorySettings(
    update: LocalAIMemorySettingsUpdate,
  ): Promise<LocalAIMemorySettings> | LocalAIMemorySettings;
  getMemoryStatus(
    conversationId?: string,
  ): Promise<LocalAIMemoryStatus> | LocalAIMemoryStatus;
  branchConversation?(
    request: LocalAIBranchConversationRequest,
  ): Promise<void> | void;
  deleteConversation?(
    request: LocalAIDeleteConversationRequest,
  ): Promise<void> | void;
}

const DISABLED_MEMORY_SETTINGS: LocalAIMemorySettings = {
  provider: "off",
  baseURL: "",
  apiKeyConfigured: false,
  subconsciousProvider: "off",
  schedule: "every-turn",
  batchSize: 5,
  idleDelayMs: 30_000,
};

const DISABLED_MEMORY_STATUS: LocalAIMemoryStatus = {
  health: "disabled",
  detail: "Memory is disabled.",
  pendingJobs: 0,
  failedJobs: 0,
};

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
  private readonly turnHooks: LocalAiTurnHooks;
  private readonly memoryService?: LocalAiMemoryRuntimeService;
  private sessionRepository?: SessionStateRepository;
  private readonly sessionExecutor = new KeyedSerialExecutor();

  constructor(
    options: {
      adapters?: LocalAiProviderAdapter[];
      streamInvoker?: RuntimeStreamInvoker;
      workingDirectory?: string;
      getToolGroups?: AgentToolGroupProvider;
      executeTool?: AgentToolExecutor;
      sessionRepository?: SessionStateRepository;
      turnHooks?: LocalAiTurnHooks;
      memoryService?: LocalAiMemoryRuntimeService;
    } = {},
  ) {
    const adapters = options.adapters ?? [
      new ClaudeCodeAdapter(),
      new CodexCliAdapter(),
    ];
    this.streamInvoker = options.streamInvoker ?? defaultStreamInvoker;
    this.workingDirectory = options.workingDirectory ?? process.cwd();
    this.getToolGroups = options.getToolGroups ?? (() => []);
    this.sessionRepository = options.sessionRepository;
    this.turnHooks = options.turnHooks ?? {};
    this.memoryService = options.memoryService;
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
    const providerId = request.providerId;

    const operationMessages =
      request.operation.kind === "append"
        ? [request.operation.message]
        : request.operation.messages;
    if (operationMessages.length === 0) {
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

    let prepared: PreparedSessionTurn | undefined;
    let providerMayHaveAdvanced = false;
    let turnContext: PreparedLocalAiTurnContext | undefined;
    try {
      await this.sessionExecutor.run(request.conversationId, async () => {
        const repository = this.getSessionRepository();
        prepared = await repository.beginTurn({
          turnId: request.turnId,
          requestId: request.requestId,
          conversationId: request.conversationId,
          providerId,
          operation: request.operation.kind,
          expectedRevision: request.expectedRevision,
        });
        controller.signal.throwIfAborted();

        const probeStatus = await adapter.getStatus();
        controller.signal.throwIfAborted();
        if (!probeStatus.available || !probeStatus.authenticated) {
          throw Object.assign(
            new Error(
              probeStatus.detail ??
                `${probeStatus.label} is unavailable or unauthenticated.`,
            ),
            {
              code: probeStatus.available
                ? "PROVIDER_UNAUTHENTICATED"
                : "PROVIDER_MISSING",
            },
          );
        }

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
        turnContext = await this.turnHooks.prepareTurnContext?.({
          request: trustedRequest,
          prepared,
          requestInteraction,
        });
        controller.signal.throwIfAborted();
        if (turnContext?.forceNewSession && prepared.binding) {
          prepared = await repository.rotatePendingTurn(request.turnId);
        }

        const resumableBinding =
          request.operation.kind === "append" && !turnContext?.forceNewSession
            ? prepared.binding
            : undefined;
        if (
          resumableBinding &&
          resumableBinding.cwd !== this.workingDirectory
        ) {
          throw Object.assign(
            new Error(
              "The provider session was created in a different working directory. Rebase the conversation before continuing.",
            ),
            { code: "LOCAL_AI_SESSION_CWD_MISMATCH" },
          );
        }
        if (resumableBinding?.stale) {
          throw Object.assign(
            new Error(
              "The provider session may contain an uncommitted turn. Bootstrap or rebase before continuing.",
            ),
            { code: "LOCAL_AI_SESSION_REBASE_REQUIRED" },
          );
        }

        const toolGroups = await this.getToolGroups();
        controller.signal.throwIfAborted();
        const tools = this.mergeTools(
          createAgentToolCatalog({
            groups: toolGroups,
            executeTool: this.executeTool,
            requestInteraction,
          }),
          turnContext?.additionalTools ?? [],
        );
        const run = await adapter.prepareRun(trustedRequest, probeStatus, {
          session: resumableBinding,
          tools,
          requestInteraction,
        });
        controller.signal.throwIfAborted();
        // Persist the uncertain boundary before invoking the provider. Some
        // stream implementations begin work synchronously, so recording this
        // afterwards could leave an advanced native session looking safe
        // after a process crash.
        await repository.markProviderStarted(request.turnId);
        providerMayHaveAdvanced = true;
        const result = this.streamInvoker({
          model: run.model,
          messages: toMessages(
            request,
            resumableBinding !== undefined,
            turnContext?.systemContext,
          ),
          abortSignal: controller.signal,
          maxOutputTokens: request.options?.maxOutputTokens,
          providerOptions: run.providerOptions,
        });
        const forwarded = await this.forwardStream(
          request.requestId,
          result,
          emit,
          tools,
        );
        controller.signal.throwIfAborted();
        if (
          forwarded.finishReason === "error" ||
          forwarded.finishReason === "unknown"
        ) {
          throw Object.assign(
            new Error(
              `Provider turn did not complete successfully: ${forwarded.finishReason}`,
            ),
            { code: "LOCAL_AI_PROVIDER_TURN_INCOMPLETE" },
          );
        }

        const nativeSessionId = run.getNativeSessionId(
          forwarded.providerMetadata,
        );
        controller.signal.throwIfAborted();
        const binding = await repository.completeTurn({
          turnId: request.turnId,
          nativeSessionId,
          cwd: this.workingDirectory,
          modelId: request.modelId,
          memoryCursors: turnContext?.memoryCursors,
        });
        if (forwarded.finishChunk) {
          emit({
            type: "ui-message",
            requestId: request.requestId,
            chunk: forwarded.finishChunk,
          });
        }
        emit({
          type: "finish",
          requestId: request.requestId,
          finishReason: forwarded.finishReason,
          usage: forwarded.usage,
          conversationId: request.conversationId,
          turnId: request.turnId,
          revision: prepared!.turn.revision,
        });
        this.runDetachedHook(() =>
          this.turnHooks.onTurnCompleted?.({
            request: trustedRequest,
            revision: prepared!.turn.revision,
            assistantText: forwarded.assistantText,
            binding,
            contextToken: turnContext?.contextToken,
          }),
        );
      });
    } catch (error) {
      const serializedError = serializeLocalAiError(error);
      if (prepared) {
        try {
          await this.getSessionRepository().failTurn(
            request.turnId,
            providerMayHaveAdvanced
              ? "uncertain"
              : controller.signal.aborted
                ? "aborted"
                : "failed",
            serializedError.message,
          );
        } catch {
          // Preserve the provider failure as the user-facing error.
        }
      }
      if (controller.signal.aborted) {
        emit({
          type: "finish",
          requestId: request.requestId,
          finishReason: "aborted",
          conversationId: request.conversationId,
          turnId: request.turnId,
          revision: prepared?.turn.revision,
        });
      } else {
        this.emitFailure(request.requestId, emit, error, undefined, {
          conversationId: request.conversationId,
          turnId: request.turnId,
          revision: prepared?.turn.revision,
        });
      }
      this.runDetachedHook(() =>
        this.turnHooks.onTurnFailed?.({
          request,
          revision: prepared?.turn.revision,
          error: serializedError,
          providerMayHaveAdvanced,
          contextToken: turnContext?.contextToken,
        }),
      );
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

  async getConversationRuntimeState(
    conversationId: string,
  ): Promise<LocalAIConversationRuntimeState | null> {
    const repository = this.getSessionRepository();
    const conversation = await repository.getConversation(conversationId);
    if (!conversation) return null;
    const bindings = await repository.getBindings(conversationId);
    return {
      conversationId,
      revision: conversation.revision,
      memoryEpoch: conversation.memoryEpoch,
      memoryVersion: conversation.memoryVersion,
      providers: bindings
        .filter((binding) => binding.revision === conversation.revision)
        .map((binding) => ({
          providerId: binding.providerId,
          modelId: binding.modelId,
          revision: binding.revision,
          stale: binding.stale,
          updatedAt: binding.updatedAt,
        })),
    };
  }

  async branchConversation(
    request: LocalAIBranchConversationRequest,
  ): Promise<LocalAIConversationRuntimeState> {
    return this.sessionExecutor.run(request.sourceConversationId, async () => {
      const repository = this.getSessionRepository();
      await repository.branchConversation(
        request.sourceConversationId,
        request.targetConversationId,
      );
      try {
        await this.memoryService?.branchConversation?.(request);
      } catch (error) {
        await repository.deleteConversation(request.targetConversationId);
        throw error;
      }
      const state = await this.getConversationRuntimeState(
        request.targetConversationId,
      );
      if (!state) {
        throw new Error(
          `Conversation branch was not persisted: ${request.targetConversationId}`,
        );
      }
      return state;
    });
  }

  async deleteConversation(
    request: LocalAIDeleteConversationRequest,
  ): Promise<boolean> {
    return this.sessionExecutor.run(request.conversationId, async () => {
      if (request.forgetConversationMemory) {
        await this.memoryService?.deleteConversation?.(request);
      }
      await this.getSessionRepository().deleteConversation(
        request.conversationId,
      );
      // Deletion is intentionally idempotent so legacy renderer-only
      // conversations can still be removed.
      return true;
    });
  }

  async resetConversationProviderSession(
    request: LocalAIResetProviderSessionRequest,
  ): Promise<LocalAIConversationRuntimeState> {
    if (!isProviderId(request.providerId)) {
      throw Object.assign(
        new Error(`Unknown local AI provider: ${request.providerId}`),
        { code: "UNKNOWN_PROVIDER" },
      );
    }
    const providerId = request.providerId;
    return this.sessionExecutor.run(request.conversationId, async () => {
      const repository = this.getSessionRepository();
      await repository.resetProvider(request.conversationId, providerId);
      const state = await this.getConversationRuntimeState(
        request.conversationId,
      );
      if (!state) {
        throw Object.assign(
          new Error(`Conversation not found: ${request.conversationId}`),
          { code: "LOCAL_AI_CONVERSATION_NOT_FOUND" },
        );
      }
      return state;
    });
  }

  getMemorySettings(): Promise<LocalAIMemorySettings> | LocalAIMemorySettings {
    return (
      this.memoryService?.getMemorySettings() ?? {
        ...DISABLED_MEMORY_SETTINGS,
      }
    );
  }

  updateMemorySettings(
    update: LocalAIMemorySettingsUpdate,
  ): Promise<LocalAIMemorySettings> | LocalAIMemorySettings {
    if (!this.memoryService) {
      if (
        Object.keys(update).length === 0 ||
        (Object.keys(update).length === 1 && update.provider === "off")
      ) {
        return { ...DISABLED_MEMORY_SETTINGS };
      }
      throw Object.assign(new Error("Memory service is unavailable."), {
        code: "LOCAL_AI_MEMORY_UNAVAILABLE",
      });
    }
    return this.memoryService.updateMemorySettings(update);
  }

  getMemoryStatus(
    conversationId?: string,
  ): Promise<LocalAIMemoryStatus> | LocalAIMemoryStatus {
    return (
      this.memoryService?.getMemoryStatus(conversationId) ?? {
        ...DISABLED_MEMORY_STATUS,
      }
    );
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
    emit: (event: LocalAIStreamEvent) => void,
    tools: AgentTool[],
  ): Promise<ForwardedStream> {
    const eventNames = new Map(
      tools.map((tool) => [tool.name, tool.qualifiedName]),
    );
    let streamedFinishReason: LocalAIFinishReason = "unknown";
    let finishChunk: UIMessageChunk | undefined;
    let assistantText = "";

    for await (const chunk of result.toUIMessageStream({
      onError: (error) => serializeLocalAiError(error).message,
    })) {
      const qualifiedChunk = this.qualifyToolChunk(chunk, eventNames);
      if (qualifiedChunk.type === "finish") {
        streamedFinishReason = finishReason(qualifiedChunk.finishReason);
        finishChunk = qualifiedChunk;
      } else if (qualifiedChunk.type === "error") {
        streamedFinishReason = "error";
      } else if (qualifiedChunk.type === "text-delta") {
        assistantText += qualifiedChunk.delta;
      }
      if (qualifiedChunk.type === "finish") continue;
      emit({ type: "ui-message", requestId, chunk: qualifiedChunk });
    }

    const resolvedFinishReason = result.finishReason
      ? finishReason(await result.finishReason)
      : streamedFinishReason;
    const usage = result.usage ? usageFrom(await result.usage) : undefined;
    const providerMetadata = result.providerMetadata
      ? await result.providerMetadata
      : undefined;
    return {
      finishReason: resolvedFinishReason,
      usage,
      providerMetadata,
      finishChunk,
      assistantText,
    };
  }

  private mergeTools(
    catalogTools: AgentTool[],
    additionalTools: AgentTool[],
  ): AgentTool[] {
    const tools = [...catalogTools];
    const aliases = new Set(catalogTools.map((tool) => tool.name));
    const qualifiedNames = new Set(
      catalogTools.map((tool) => tool.qualifiedName),
    );
    for (const tool of additionalTools) {
      if (aliases.has(tool.name) || qualifiedNames.has(tool.qualifiedName)) {
        throw Object.assign(
          new Error(`Duplicate injected tool: ${tool.qualifiedName}`),
          { code: "LOCAL_AI_DUPLICATE_TOOL" },
        );
      }
      aliases.add(tool.name);
      qualifiedNames.add(tool.qualifiedName);
      tools.push(tool);
    }
    return tools;
  }

  private runDetachedHook(
    operation: () => Promise<void> | void | undefined,
  ): void {
    void Promise.resolve()
      .then(operation)
      .catch(() => undefined);
  }

  private getSessionRepository(): SessionStateRepository {
    if (!this.sessionRepository) {
      this.sessionRepository = new JsonSessionStateRepository({
        path: defaultSessionStatePath(),
      });
    }
    return this.sessionRepository;
  }

  private emitFailure(
    requestId: string,
    emit: (event: LocalAIStreamEvent) => void,
    error: unknown,
    code?: string,
    context?: {
      conversationId: string;
      turnId: string;
      revision?: number;
    },
  ): void {
    emit({
      type: "error",
      requestId,
      error: serializeLocalAiError(error, code),
    });
    emit({
      type: "finish",
      requestId,
      finishReason: "error",
      ...context,
    });
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
