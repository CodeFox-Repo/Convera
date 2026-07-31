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
  LocalAITurnRuntimeState,
  LocalAITurnRuntimeStateRequest,
  LocalAIUsage,
} from "@/shared/types/local-ai";
import type { AgentSandbox } from "@/shared/types/workspace";
import {
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ProviderMetadata,
  type StopCondition,
  type ToolSet,
  type UIMessageChunk,
} from "ai";
import { createHash, randomUUID } from "node:crypto";
import {
  createAgentToolCatalog,
  type AgentTool,
  type AgentToolGroup,
  type AgentToolInteraction,
} from "./agent-tools";
import { createBasicAgentTools } from "./basic-tools";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "./provider-descriptors";
import type {
  LocalAiProviderAdapter,
  LocalAiProviderExecutionPolicy,
} from "./provider-adapter";
import { ClaudeCodeAdapter } from "./providers/claude-code";
import { CodexCliAdapter } from "./providers/codex-cli";
import { OpenAIApiAdapter } from "./providers/openai-api";
import {
  defaultSessionStatePath,
  DEFAULT_LOCAL_AI_ACTOR_ID,
  JsonSessionStateRepository,
} from "./session/repository";
import { KeyedSerialExecutor } from "./session/serial-executor";
import type {
  DurableMemoryTurnHookPayload,
  DurableTurnHookRecord,
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
  tools?: ToolSet;
  stopWhen?: StopCondition<ToolSet>;
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

export type AgentSandboxResolver = (
  request: LocalAIChatRequest,
) => AgentSandbox | Promise<AgentSandbox>;

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

/**
 * What a turn must not overlap with. Concurrent turns speak through tools and
 * own only their own provider session, which is already keyed by actor.
 */
function sessionKey(
  request: Pick<LocalAIChatRequest, "conversationId" | "agent" | "concurrent">,
): string {
  return request.concurrent
    ? `${request.conversationId}\0${resolveLocalAiActorId(request)}`
    : request.conversationId;
}

export function resolveLocalAiActorId(
  request: Pick<LocalAIChatRequest, "agent">,
): string {
  const memberId = request.agent?.memberId?.trim();
  if (memberId) return memberId;
  const agentId = request.agent?.id?.trim();
  return agentId ? `agent:${agentId}` : DEFAULT_LOCAL_AI_ACTOR_ID;
}

export function fingerprintAgentContext(
  request: Pick<LocalAIChatRequest, "agent">,
  sandbox: AgentSandbox,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        actorId: resolveLocalAiActorId(request),
        systemPrompt: request.agent?.systemPrompt?.trim() ?? "",
        sandbox: {
          root: sandbox.root,
          writableRoots: [...sandbox.writableRoots].sort(),
          networkAccess: sandbox.networkAccess,
        },
      }),
    )
    .digest("hex");
}

export function serializeLocalAiError(
  error: unknown,
  code?: string,
): LocalAISerializableError {
  if (error instanceof Error) {
    const errorWithCode = error as Error & {
      code?: unknown;
      retryable?: unknown;
    };
    return {
      name: error.name,
      message: error.message,
      code:
        code ??
        (typeof errorWithCode.code === "string"
          ? errorWithCode.code
          : undefined),
      stack: error.stack,
      retryable:
        typeof errorWithCode.retryable === "boolean"
          ? errorWithCode.retryable
          : undefined,
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
      ? resumesNativeSession
        ? [request.operation.message]
        : (request.operation.recoveryMessages ?? [request.operation.message])
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

interface ActiveRuntimeRequest {
  conversationId: string;
  controller: AbortController;
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
  prepareDurableTurnHook?(input: {
    request: LocalAIChatRequest;
    prepared: PreparedSessionTurn;
    contextToken?: unknown;
  }):
    | Promise<DurableMemoryTurnHookPayload | undefined>
    | DurableMemoryTurnHookPayload
    | undefined;
  replayDurableTurnHook?(hook: DurableTurnHookRecord): Promise<void> | void;
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
  readonly executionPolicy: LocalAiProviderExecutionPolicy;
  private readonly adapters = new Map<
    LocalAiProviderId,
    LocalAiProviderAdapter
  >();
  private readonly activeRequests = new Map<string, ActiveRuntimeRequest>();
  private readonly inFlightChats = new Set<Promise<void>>();
  private readonly streamInvoker: RuntimeStreamInvoker;
  private readonly workingDirectory: string;
  private readonly sandbox: AgentSandbox;
  private readonly resolveSandbox: AgentSandboxResolver;
  private readonly getToolGroups: AgentToolGroupProvider;
  private readonly executeTool: AgentToolExecutor;
  private readonly pendingInteractions = new Map<string, PendingInteraction>();
  private readonly detachedHooks = new Set<Promise<void>>();
  private readonly conversationLeases = new Map<string, string>();
  private readonly quiesceTimeoutMs: number;
  private disposing = false;
  private readonly turnHooks: LocalAiTurnHooks;
  private readonly memoryService?: LocalAiMemoryRuntimeService;
  private sessionRepository?: SessionStateRepository;
  private readonly sessionExecutor = new KeyedSerialExecutor();
  private readonly durableHookReplayConversations = new Set<string>();
  private durableHookRetryTimer?: ReturnType<typeof setTimeout>;
  private durableHookRetryScheduleVersion = 0;
  private memorySettingsBarrier: Promise<void> = Promise.resolve();
  private pendingMemorySettingsUpdates = 0;

  constructor(
    options: {
      adapters?: LocalAiProviderAdapter[];
      streamInvoker?: RuntimeStreamInvoker;
      workingDirectory?: string;
      sandbox?: AgentSandbox;
      resolveSandbox?: AgentSandboxResolver;
      getToolGroups?: AgentToolGroupProvider;
      executeTool?: AgentToolExecutor;
      sessionRepository?: SessionStateRepository;
      turnHooks?: LocalAiTurnHooks;
      memoryService?: LocalAiMemoryRuntimeService;
      quiesceTimeoutMs?: number;
      executionPolicy?: LocalAiProviderExecutionPolicy;
    } = {},
  ) {
    const adapters = options.adapters ?? [
      new ClaudeCodeAdapter(),
      new CodexCliAdapter(),
      new OpenAIApiAdapter(),
    ];
    this.streamInvoker = options.streamInvoker ?? defaultStreamInvoker;
    this.workingDirectory = options.workingDirectory ?? process.cwd();
    this.sandbox = options.sandbox ?? {
      root: this.workingDirectory,
      // A standalone runtime receives an existing trusted working directory.
      // Electron Main supplies its own resolver that creates and narrows each
      // agent to a dedicated workspace.
      writableRoots: [this.workingDirectory],
      networkAccess: false,
    };
    this.resolveSandbox = options.resolveSandbox ?? (() => this.sandbox);
    this.getToolGroups = options.getToolGroups ?? (() => []);
    this.sessionRepository = options.sessionRepository;
    this.turnHooks = options.turnHooks ?? {};
    this.memoryService = options.memoryService;
    this.quiesceTimeoutMs = options.quiesceTimeoutMs ?? 5_000;
    this.executionPolicy = options.executionPolicy ?? "interactive";
    this.executeTool =
      options.executeTool ??
      (async (serverName, toolName) => {
        throw new Error(
          `Tool executor is unavailable for ${serverName}:${toolName}.`,
        );
      });
    if (
      Boolean(this.turnHooks.prepareDurableTurnHook) !==
      Boolean(this.turnHooks.replayDurableTurnHook)
    ) {
      throw new Error(
        "Durable turn hooks must configure both prepare and replay handlers.",
      );
    }

    for (const adapter of adapters) {
      this.adapters.set(adapter.id, adapter);
    }
    if (this.turnHooks.replayDurableTurnHook) {
      queueMicrotask(() => this.initializeDurableTurnHooks());
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

  startChat(
    request: LocalAIChatRequest,
    emit: (event: LocalAIStreamEvent) => void,
  ): Promise<void> {
    if (this.disposing) {
      this.emitFailure(
        request.requestId,
        emit,
        new Error("Local AI runtime is shutting down."),
        "LOCAL_AI_RUNTIME_DISPOSED",
      );
      return Promise.resolve();
    }
    const task = this.runChat(request, emit).finally(() => {
      this.inFlightChats.delete(task);
    });
    this.inFlightChats.add(task);
    return task;
  }

  private async runChat(
    request: LocalAIChatRequest,
    emit: (event: LocalAIStreamEvent) => void,
  ): Promise<void> {
    if (this.conversationLeases.has(request.conversationId)) {
      this.emitFailure(
        request.requestId,
        emit,
        new Error("The conversation is being deleted."),
        "LOCAL_AI_CONVERSATION_QUIESCED",
      );
      return;
    }
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
    this.activeRequests.set(request.requestId, {
      conversationId: request.conversationId,
      controller,
    });

    let prepared: PreparedSessionTurn | undefined;
    let providerMayHaveAdvanced = false;
    let turnContext: PreparedLocalAiTurnContext | undefined;
    let durableHookArmed = false;
    try {
      await this.memorySettingsBarrier;
      // A turn that reserves no transcript row has nothing to race over, so it
      // serializes per actor rather than per conversation: two agents offered
      // the same message run at once, while one agent's own turns still queue.
      await this.sessionExecutor.run(sessionKey(request), async () => {
        const repository = this.getSessionRepository();
        await this.replayDurableTurnHooksForConversation(
          request.conversationId,
        );
        await this.rescheduleDurableTurnHookRetry();
        prepared = await repository.beginTurn({
          turnId: request.turnId,
          requestId: request.requestId,
          conversationId: request.conversationId,
          actorId: resolveLocalAiActorId(request),
          providerId,
          operation: request.operation.kind,
          operationReason:
            request.operation.kind === "rebase"
              ? request.operation.reason
              : undefined,
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

        const sandbox = await this.resolveSandbox(request);
        const trustedWorkingDirectory =
          sandbox.writableRoots[0] ?? sandbox.root;
        const contextFingerprint = fingerprintAgentContext(request, sandbox);
        const trustedRequest: LocalAIChatRequest = {
          ...request,
          options: {
            ...request.options,
            cwd: trustedWorkingDirectory,
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
        const boundContextChanged =
          prepared.binding !== undefined &&
          prepared.binding.contextFingerprint !== contextFingerprint;
        if (
          (turnContext?.forceNewSession || boundContextChanged) &&
          prepared.binding
        ) {
          if (
            request.operation.kind === "append" &&
            !request.operation.recoveryMessages
          ) {
            throw Object.assign(
              new Error(
                "A bounded recovery transcript is required before rotating an append turn.",
              ),
              { code: "LOCAL_AI_RECOVERY_TRANSCRIPT_REQUIRED" },
            );
          }
          prepared = await repository.rotatePendingTurn(request.turnId);
        }
        const durableHook = await this.turnHooks.prepareDurableTurnHook?.({
          request: trustedRequest,
          prepared,
          contextToken: turnContext?.contextToken,
        });
        if (durableHook) {
          await repository.armTurnHook(request.turnId, durableHook);
          durableHookArmed = true;
        }

        const resumableBinding =
          request.operation.kind === "append" && !turnContext?.forceNewSession
            ? prepared.binding
            : undefined;
        if (
          resumableBinding &&
          resumableBinding.cwd !== trustedWorkingDirectory
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

        const toolGroups =
          this.executionPolicy === "text-only"
            ? []
            : await this.getToolGroups();
        controller.signal.throwIfAborted();
        const nativeMcpServers =
          this.executionPolicy === "text-only"
            ? {}
            : Object.fromEntries(
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
        const tools =
          this.executionPolicy === "text-only"
            ? []
            : this.mergeTools(
                [
                  // A provider that brings no tools of its own gets the floor.
                  ...(adapter.providesOwnTools === false
                    ? createBasicAgentTools(sandbox)
                    : []),
                  ...createAgentToolCatalog({
                    groups: toolGroups.filter(
                      (group) => !group.nativeMcpServer,
                    ),
                    executeTool: this.executeTool,
                    requestInteraction,
                    sandbox,
                  }),
                ],
                turnContext?.additionalTools ?? [],
              );
        controller.signal.throwIfAborted();
        const run = await adapter.prepareRun(trustedRequest, probeStatus, {
          session: resumableBinding,
          tools,
          nativeMcpServers,
          executionPolicy: this.executionPolicy,
          sandbox,
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
          tools: run.tools,
          // Tools passed here are executed by the AI SDK, so the loop has to be
          // stepped explicitly or the turn ends at the first tool call.
          stopWhen: run.tools ? stepCountIs(12) : undefined,
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
          cwd: trustedWorkingDirectory,
          modelId: request.modelId,
          finishReason: forwarded.finishReason,
          assistantText: forwarded.assistantText,
          assistantHookContent: forwarded.assistantText,
          memoryCursors: turnContext?.memoryCursors,
          contextFingerprint,
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
        if (durableHookArmed && this.turnHooks.replayDurableTurnHook) {
          this.scheduleDurableTurnHookReplay(request.conversationId);
        } else {
          this.runDetachedHook(() =>
            this.turnHooks.onTurnCompleted?.({
              request: trustedRequest,
              revision: prepared!.turn.revision,
              assistantText: forwarded.assistantText,
              binding,
              contextToken: turnContext?.contextToken,
            }),
          );
        }
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
      if (durableHookArmed && this.turnHooks.replayDurableTurnHook) {
        this.scheduleDurableTurnHookReplay(request.conversationId);
      } else {
        this.runDetachedHook(() =>
          this.turnHooks.onTurnFailed?.({
            request,
            revision: prepared?.turn.revision,
            error: serializedError,
            providerMayHaveAdvanced,
            contextToken: turnContext?.contextToken,
          }),
        );
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
    const active = this.activeRequests.get(requestId);
    if (!active) {
      return false;
    }

    active.controller.abort();
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
      transcriptVersion: conversation.transcriptVersion,
      lastCompletedProviderId: conversation.lastCompletedProviderId,
      memoryEpoch: conversation.memoryEpoch,
      memoryVersion: conversation.memoryVersion,
      providers: bindings
        .filter((binding) => binding.revision === conversation.revision)
        .map((binding) => ({
          actorId: binding.actorId ?? DEFAULT_LOCAL_AI_ACTOR_ID,
          providerId: binding.providerId,
          modelId: binding.modelId,
          revision: binding.revision,
          transcriptVersion: binding.transcriptVersion,
          stale: binding.stale,
          updatedAt: binding.updatedAt,
        })),
    };
  }

  async quiesceConversation(conversationId: string): Promise<string> {
    if (this.conversationLeases.has(conversationId)) {
      throw Object.assign(
        new Error("The conversation already has an active lifecycle lease."),
        { code: "LOCAL_AI_CONVERSATION_LEASE_CONFLICT" },
      );
    }

    const leaseToken = randomUUID();
    this.conversationLeases.set(conversationId, leaseToken);
    for (const active of this.activeRequests.values()) {
      if (active.conversationId === conversationId) {
        active.controller.abort();
      }
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.sessionExecutor.run(conversationId, async () => undefined),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            reject(
              Object.assign(
                new Error("Timed out while stopping active conversation work."),
                { code: "LOCAL_AI_CONVERSATION_QUIESCE_TIMEOUT" },
              ),
            );
          }, this.quiesceTimeoutMs);
        }),
      ]);
      return leaseToken;
    } catch (error) {
      if (this.conversationLeases.get(conversationId) === leaseToken) {
        this.conversationLeases.delete(conversationId);
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  resumeConversation(conversationId: string, leaseToken: string): boolean {
    this.assertConversationLease(conversationId, leaseToken);
    this.conversationLeases.delete(conversationId);
    return true;
  }

  async getTurnRuntimeState(
    request: LocalAITurnRuntimeStateRequest,
  ): Promise<LocalAITurnRuntimeState | null> {
    return this.sessionExecutor.run(
      request.conversationId,
      async () =>
        (await this.getSessionRepository().getTurnRuntimeState(
          request.conversationId,
          request.turnId,
        )) ?? null,
    );
  }

  acknowledgeTurnPersistence(
    request: LocalAITurnRuntimeStateRequest,
  ): Promise<boolean> {
    return this.sessionExecutor.run(request.conversationId, () =>
      this.getSessionRepository().acknowledgeTurnPersistence(
        request.conversationId,
        request.turnId,
      ),
    );
  }

  async branchConversation(
    request: LocalAIBranchConversationRequest,
  ): Promise<LocalAIConversationRuntimeState> {
    return this.sessionExecutor.runMany(
      [request.sourceConversationId, request.targetConversationId],
      async () => {
        if (
          this.conversationLeases.has(request.sourceConversationId) ||
          this.conversationLeases.has(request.targetConversationId)
        ) {
          throw Object.assign(
            new Error("A conversation in this branch is being deleted."),
            { code: "LOCAL_AI_CONVERSATION_QUIESCED" },
          );
        }
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
        const conversation = await repository.getConversation(
          request.targetConversationId,
        );
        if (!conversation) {
          throw new Error(
            `Conversation branch was not persisted: ${request.targetConversationId}`,
          );
        }
        const bindings = await repository.getBindings(
          request.targetConversationId,
        );
        return {
          conversationId: request.targetConversationId,
          revision: conversation.revision,
          transcriptVersion: conversation.transcriptVersion,
          lastCompletedProviderId: conversation.lastCompletedProviderId,
          memoryEpoch: conversation.memoryEpoch,
          memoryVersion: conversation.memoryVersion,
          providers: bindings
            .filter((binding) => binding.revision === conversation.revision)
            .map((binding) => ({
              actorId: binding.actorId ?? DEFAULT_LOCAL_AI_ACTOR_ID,
              providerId: binding.providerId,
              modelId: binding.modelId,
              revision: binding.revision,
              transcriptVersion: binding.transcriptVersion,
              stale: binding.stale,
              updatedAt: binding.updatedAt,
            })),
        };
      },
    );
  }

  async deleteConversation(
    request: LocalAIDeleteConversationRequest,
  ): Promise<boolean> {
    this.assertConversationLease(request.conversationId, request.leaseToken);
    try {
      return await this.sessionExecutor.run(
        request.conversationId,
        async () => {
          const repository = this.getSessionRepository();
          const deletion = await repository.beginConversationDeletion(
            request.conversationId,
            request.forgetConversationMemory,
          );
          if (deletion.status === "completed") {
            return true;
          }
          try {
            await this.memoryService?.deleteConversation?.({
              ...request,
              forgetConversationMemory: deletion.forgetConversationMemory,
              operationId: deletion.operationId,
            });
            await repository.completeConversationDeletion(
              request.conversationId,
            );
          } catch (error) {
            await repository
              .failConversationDeletion(
                request.conversationId,
                serializeLocalAiError(error).message,
              )
              .catch(() => undefined);
            throw error;
          }
          return true;
        },
      );
    } finally {
      await this.rescheduleDurableTurnHookRetry().catch(() => undefined);
      if (
        this.conversationLeases.get(request.conversationId) ===
        request.leaseToken
      ) {
        this.conversationLeases.delete(request.conversationId);
      }
    }
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

  async updateMemorySettings(
    update: LocalAIMemorySettingsUpdate,
  ): Promise<LocalAIMemorySettings> {
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
    const previousSettingsBarrier = this.memorySettingsBarrier;
    let releaseSettingsBarrier!: () => void;
    const currentSettingsBarrier = new Promise<void>((resolve) => {
      releaseSettingsBarrier = resolve;
    });
    this.memorySettingsBarrier = previousSettingsBarrier.then(
      () => currentSettingsBarrier,
    );
    this.pendingMemorySettingsUpdates += 1;
    this.clearDurableTurnHookRetryTimer();
    await previousSettingsBarrier;
    try {
      const repository = this.getSessionRepository();
      const snapshot = await repository.snapshot();
      const conversations = new Set(
        (snapshot.turnHooks ?? []).map((hook) => hook.conversationId),
      );
      for (const active of this.activeRequests.values()) {
        conversations.add(active.conversationId);
      }
      return await this.sessionExecutor.runMany(
        [...conversations],
        async () => {
          const settings =
            await this.memoryService!.updateMemorySettings(update);
          await repository.resetTurnHookRetries("configuration");
          return settings;
        },
      );
    } finally {
      releaseSettingsBarrier();
      this.pendingMemorySettingsUpdates -= 1;
      if (this.pendingMemorySettingsUpdates === 0) {
        this.triggerDurableTurnHookReplay();
        await this.rescheduleDurableTurnHookRetry();
      }
    }
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
    this.disposing = true;
    this.clearDurableTurnHookRetryTimer();
    for (const active of this.activeRequests.values()) {
      active.controller.abort();
    }
    for (const [interactionId, pending] of this.pendingInteractions) {
      this.releaseInteraction(interactionId, pending);
      pending.reject(new Error("Local AI runtime disposed."));
    }

    await Promise.allSettled([...this.inFlightChats]);
    if (this.turnHooks.replayDurableTurnHook) {
      const hooks = await this.getSessionRepository().listReplayableTurnHooks();
      for (const conversationId of new Set(
        hooks.map((hook) => hook.conversationId),
      )) {
        this.scheduleDurableTurnHookReplay(conversationId, true);
      }
    }
    while (this.detachedHooks.size > 0) {
      await Promise.allSettled([...this.detachedHooks]);
    }
    this.activeRequests.clear();
    this.conversationLeases.clear();
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
    const task = Promise.resolve()
      .then(operation)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.detachedHooks.delete(task);
      });
    this.detachedHooks.add(task);
  }

  private trackDetachedTask(task: Promise<unknown>): void {
    const tracked = task
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.detachedHooks.delete(tracked);
      });
    this.detachedHooks.add(tracked);
  }

  private triggerDurableTurnHookReplay(): void {
    if (
      this.disposing ||
      this.pendingMemorySettingsUpdates > 0 ||
      !this.turnHooks.replayDurableTurnHook
    ) {
      return;
    }
    this.runDetachedHook(async () => {
      try {
        const hooks =
          await this.getSessionRepository().listReplayableTurnHooks();
        for (const conversationId of new Set(
          hooks.map((hook) => hook.conversationId),
        )) {
          this.scheduleDurableTurnHookReplay(conversationId);
        }
      } finally {
        await this.rescheduleDurableTurnHookRetry();
      }
    });
  }

  private scheduleDurableTurnHookReplay(
    conversationId: string,
    duringDispose = false,
  ): void {
    if (
      (this.disposing && !duringDispose) ||
      this.pendingMemorySettingsUpdates > 0 ||
      !this.turnHooks.replayDurableTurnHook ||
      this.durableHookReplayConversations.has(conversationId)
    ) {
      return;
    }
    this.durableHookReplayConversations.add(conversationId);
    // Queue synchronously behind the current provider turn. A later
    // quiesce/delete cannot overtake this replay.
    const replay = this.sessionExecutor.run(conversationId, () =>
      this.replayDurableTurnHooksForConversation(conversationId),
    );
    this.trackDetachedTask(
      replay.finally(async () => {
        this.durableHookReplayConversations.delete(conversationId);
        await this.rescheduleDurableTurnHookRetry();
      }),
    );
  }

  private async replayDurableTurnHooksForConversation(
    conversationId: string,
  ): Promise<void> {
    if (!this.turnHooks.replayDurableTurnHook) return;
    const repository = this.getSessionRepository();
    const deletion = await repository.getConversationDeletion(conversationId);
    const hooks = (await repository.listReplayableTurnHooks()).filter(
      (hook) => hook.conversationId === conversationId,
    );
    for (const hook of hooks) {
      if (deletion) {
        await repository.acknowledgeTurnHook(hook.hookId);
        continue;
      }
      try {
        await this.turnHooks.replayDurableTurnHook(hook);
        await repository.acknowledgeTurnHook(hook.hookId);
      } catch (error) {
        const serialized = serializeLocalAiError(error);
        await repository.failTurnHook(
          hook.hookId,
          serialized.message,
          serialized.retryable !== false,
          serialized.code === "CONFIGURATION" ? "configuration" : undefined,
        );
      }
    }
  }

  private clearDurableTurnHookRetryTimer(): void {
    this.durableHookRetryScheduleVersion += 1;
    if (this.durableHookRetryTimer !== undefined) {
      clearTimeout(this.durableHookRetryTimer);
      this.durableHookRetryTimer = undefined;
    }
  }

  private initializeDurableTurnHooks(): void {
    if (this.disposing || !this.turnHooks.replayDurableTurnHook) return;
    this.runDetachedHook(async () => {
      try {
        await this.memorySettingsBarrier;
        if (this.disposing) return;
        const settings = await this.memoryService?.getMemorySettings();
        if (
          settings?.provider === "local" &&
          settings.subconsciousProvider !== "off"
        ) {
          await this.getSessionRepository().resetTurnHookRetries(
            "configuration",
          );
        }
      } finally {
        this.triggerDurableTurnHookReplay();
        await this.rescheduleDurableTurnHookRetry();
      }
    });
  }

  private async rescheduleDurableTurnHookRetry(): Promise<void> {
    const scheduleVersion = ++this.durableHookRetryScheduleVersion;
    if (
      this.disposing ||
      this.pendingMemorySettingsUpdates > 0 ||
      !this.turnHooks.replayDurableTurnHook
    ) {
      if (scheduleVersion === this.durableHookRetryScheduleVersion) {
        this.clearDurableTurnHookRetryTimer();
      }
      return;
    }

    const hooks =
      (await this.getSessionRepository().snapshot()).turnHooks ?? [];
    const nextAttemptAt = hooks
      .filter(
        (hook) =>
          hook.status === "pending" &&
          hook.retryable &&
          hook.nextAttemptAt !== undefined &&
          !this.durableHookReplayConversations.has(hook.conversationId),
      )
      .reduce<number | undefined>((earliest, hook) => {
        const timestamp = Date.parse(hook.nextAttemptAt as string);
        if (!Number.isFinite(timestamp)) return earliest;
        return earliest === undefined
          ? timestamp
          : Math.min(earliest, timestamp);
      }, undefined);
    if (scheduleVersion !== this.durableHookRetryScheduleVersion) return;

    if (this.durableHookRetryTimer !== undefined) {
      clearTimeout(this.durableHookRetryTimer);
      this.durableHookRetryTimer = undefined;
    }
    if (nextAttemptAt === undefined) return;

    const maximumDelay = 2_147_483_647;
    const delay = Math.min(
      Math.max(nextAttemptAt - Date.now(), 0),
      maximumDelay,
    );
    this.durableHookRetryTimer = setTimeout(() => {
      this.durableHookRetryTimer = undefined;
      this.durableHookRetryScheduleVersion += 1;
      this.triggerDurableTurnHookReplay();
    }, delay);
    this.durableHookRetryTimer.unref?.();
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

  private assertConversationLease(
    conversationId: string,
    leaseToken: string,
  ): void {
    if (this.conversationLeases.get(conversationId) === leaseToken) return;
    throw Object.assign(
      new Error("The conversation lifecycle lease is missing or invalid."),
      { code: "LOCAL_AI_CONVERSATION_LEASE_INVALID" },
    );
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
