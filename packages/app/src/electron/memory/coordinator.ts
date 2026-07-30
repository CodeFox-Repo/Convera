import type {
  LocalAIBranchConversationRequest,
  LocalAIChatRequest,
  LocalAIDeleteConversationRequest,
  LocalAIMemorySettings,
  LocalAIMemorySettingsUpdate,
  LocalAIMemoryStatus,
} from "@/shared/types/local-ai";
import type {
  LocalAiCompletedTurn,
  LocalAiFailedTurn,
  LocalAiMemoryRuntimeService,
  LocalAiTurnHookInput,
  LocalAiTurnHooks,
  PreparedLocalAiTurnContext,
} from "../ai/runtime";
import type {
  DurableMemoryTurnHookPayload,
  DurableTurnHookRecord,
  ProviderMemoryCursors,
} from "../ai/session/types";
import type { LocalAiProviderId } from "../ai/types";
import type { MemoryCandidateRepository } from "./candidate-sink";
import type {
  MemoryIndexRepository,
  MemoryScopeIndex,
} from "./index-repository";
import { MemoryError } from "./errors";
import {
  createConfiguredLettaApi,
  createMemoryRuntime,
  type MemoryRuntime,
} from "./runtime-factory";
import {
  type MemorySettingsRepository,
  type PublicMemorySettings,
} from "./settings-repository";
import type { SubconsciousJobRepository } from "./subconscious-job-repository";
import {
  type CompletedMemoryTurn,
  type RestrictedMemoryCurator,
  SubconsciousWorker,
} from "./subconscious-worker";
import { SerialTaskQueue } from "./serial-queue";
import { createMemoryAgentTools } from "./tools";
import { sameMemoryScope, type MemoryScope } from "./types";
import type { LettaApi } from "./letta-api";

export interface SubscriptionCuratorFactory {
  create(
    providerId: LocalAiProviderId,
  ): RestrictedMemoryCurator | Promise<RestrictedMemoryCurator>;
}

export interface MemoryScopeResolverInput {
  conversationId: string;
  providerId: string;
  workingDirectory?: string;
}

export interface MemoryIntegrationCoordinatorOptions {
  settingsRepository: MemorySettingsRepository;
  indexRepository: MemoryIndexRepository;
  jobRepository: SubconsciousJobRepository;
  candidateRepository: MemoryCandidateRepository;
  curatorFactory: SubscriptionCuratorFactory;
  userScopeId?: string | (() => string);
  resolveWorkspaceScopeId?: (input: MemoryScopeResolverInput) => string;
  contextBudget?: {
    maxCharacters: number;
    maxTokens: number;
    charactersPerToken?: number;
  };
  apiFactory?: (settings: MemorySettingsRepository) => Promise<LettaApi>;
  onConversationMemoryObserved?: (
    conversationId: string,
    state: { memoryVersion: number; memoryEpoch: number },
  ) => Promise<void> | void;
  onMemoryContextChanged?: () => Promise<void> | void;
  onMemoryScopeForgotten?: (scope: MemoryScope) => Promise<void> | void;
  now?: () => Date;
}

export interface PrepareMemoryTurnInput {
  turnId: string;
  conversationId: string;
  providerId: string;
  revision: number;
  workingDirectory?: string;
  isNewSession: boolean;
  bindingCursors?: ProviderMemoryCursors;
  requestApproval(input: {
    name: string;
    prompt: string;
    input: unknown;
  }): Promise<boolean>;
}

export interface PreparedMemoryTurn {
  systemContext?: string;
  additionalTools: ReturnType<typeof createMemoryAgentTools>;
  contextToken?: MemoryTurnContextToken;
  forceNewSession: boolean;
  memoryCursors: ProviderMemoryCursors;
}

export interface CompleteMemoryTurnInput {
  token: MemoryTurnContextToken;
  turnId: string;
  providerId: string;
  userContent: string;
  assistantContent: string;
  completedAt?: string;
}

export interface MemoryTurnContextToken {
  kind: "convera-memory-turn";
  /**
   * Stable Letta endpoint/account fingerprint. Optional only for legacy
   * serialized work, which is paused rather than replayed.
   */
  sourceId?: string;
  turnId: string;
  conversationId: string;
  revision: number;
  scopes: MemoryScope[];
}

const DEFAULT_CONTEXT_BUDGET = {
  maxCharacters: 24_000,
  maxTokens: 6_000,
  charactersPerToken: 4,
};

function providerId(value: string): LocalAiProviderId | undefined {
  return value === "codex-cli" || value === "claude-code" ? value : undefined;
}

function publicSettings(settings: PublicMemorySettings): LocalAIMemorySettings {
  return {
    provider: settings.provider,
    baseURL: settings.baseURL,
    apiKeyConfigured: settings.apiKeyConfigured,
    subconsciousProvider: settings.curator,
    schedule: settings.schedule,
    batchSize: settings.batchSize,
    idleDelayMs: settings.idleMs,
  };
}

function userContent(request: LocalAIChatRequest): string {
  const messages =
    request.operation.kind === "append"
      ? [request.operation.message]
      : request.operation.messages;
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n\n");
}

function isMemoryToken(value: unknown): value is MemoryTurnContextToken {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "convera-memory-turn"
  );
}

function hasRemoteMemory(index: MemoryScopeIndex): boolean {
  return (
    Object.keys(index.blockIds).length > 0 ||
    index.archiveId !== undefined ||
    index.agentId !== undefined ||
    index.pendingWrites.length > 0 ||
    index.pendingForgets.length > 0
  );
}

function isEmptyMemoryTombstone(index: MemoryScopeIndex): boolean {
  return (
    !hasRemoteMemory(index) &&
    index.checkpoint === undefined &&
    index.lastKnownGood === undefined &&
    Object.keys(index.appliedTurns).length === 0 &&
    index.corrections.length === 0 &&
    index.deltas.length === 0 &&
    index.version > 0 &&
    index.epoch > 0
  );
}

export class MemoryIntegrationCoordinator
  implements LocalAiTurnHooks, LocalAiMemoryRuntimeService
{
  private readonly settings: MemorySettingsRepository;
  private readonly indexes: MemoryIndexRepository;
  private readonly jobs: SubconsciousJobRepository;
  private readonly candidates: MemoryCandidateRepository;
  private readonly curatorFactory: SubscriptionCuratorFactory;
  private readonly apiFactory: (
    settings: MemorySettingsRepository,
  ) => Promise<LettaApi>;
  private readonly now: () => Date;
  private readonly budget: MemoryIntegrationCoordinatorOptions["contextBudget"];
  private readonly userScopeId: () => string;
  private readonly resolveWorkspaceScopeId: (
    input: MemoryScopeResolverInput,
  ) => string;
  private readonly onConversationMemoryObserved?: MemoryIntegrationCoordinatorOptions["onConversationMemoryObserved"];
  private readonly onMemoryContextChanged?: MemoryIntegrationCoordinatorOptions["onMemoryContextChanged"];
  private readonly onMemoryScopeForgotten?: MemoryIntegrationCoordinatorOptions["onMemoryScopeForgotten"];
  private runtime?: MemoryRuntime;
  private worker?: SubconsciousWorker;
  private readonly curators = new Map<
    LocalAiProviderId,
    RestrictedMemoryCurator
  >();
  private readonly lifecycle = new SerialTaskQueue();
  private generation = 0;
  private runtimeGeneration = -1;

  constructor(options: MemoryIntegrationCoordinatorOptions) {
    this.settings = options.settingsRepository;
    this.indexes = options.indexRepository;
    this.jobs = options.jobRepository;
    this.candidates = options.candidateRepository;
    this.curatorFactory = options.curatorFactory;
    this.apiFactory =
      options.apiFactory ?? ((settings) => createConfiguredLettaApi(settings));
    this.now = options.now ?? (() => new Date());
    this.budget = options.contextBudget ?? DEFAULT_CONTEXT_BUDGET;
    const configuredUserScopeId = options.userScopeId;
    this.userScopeId =
      typeof configuredUserScopeId === "function"
        ? configuredUserScopeId
        : () => configuredUserScopeId ?? "local-user";
    this.resolveWorkspaceScopeId =
      options.resolveWorkspaceScopeId ??
      ((input) => input.workingDirectory?.trim() || "default-workspace");
    this.onConversationMemoryObserved = options.onConversationMemoryObserved;
    this.onMemoryContextChanged = options.onMemoryContextChanged;
    this.onMemoryScopeForgotten = options.onMemoryScopeForgotten;
  }

  private scopes(input: MemoryScopeResolverInput): MemoryScope[] {
    return [
      { kind: "user", id: this.userScopeId() },
      {
        kind: "workspace",
        id: this.resolveWorkspaceScopeId(input),
      },
      { kind: "conversation", id: input.conversationId },
    ];
  }

  private async ensureRuntimeUnlocked(): Promise<MemoryRuntime> {
    if (this.runtime && this.runtimeGeneration === this.generation) {
      return this.runtime;
    }
    const runtimeGeneration = this.generation;
    const [api, sourceId] = await Promise.all([
      this.apiFactory(this.settings),
      this.settings.getSourceId(),
    ]);
    const runtime = createMemoryRuntime({
      api,
      indexRepository: this.indexes,
      storeOptions: {
        sourceId,
        isActive: () => this.generation === runtimeGeneration,
        onScopeForgotten: this.onMemoryScopeForgotten,
      },
    });
    await runtime.store.initialize();
    if (this.generation !== runtimeGeneration) {
      throw new MemoryError(
        "Memory settings changed while the Letta runtime was starting.",
        "CONFLICT",
        true,
      );
    }
    this.runtime = runtime;
    this.runtimeGeneration = runtimeGeneration;
    return runtime;
  }

  private async resolveCurator(
    activeProviderId: string | undefined,
  ): Promise<RestrictedMemoryCurator> {
    const settings = await this.settings.get();
    const selected =
      settings.curator === "follow-active"
        ? providerId(activeProviderId ?? "")
        : providerId(settings.curator);
    if (!selected) {
      throw new Error(
        "Subconscious memory curation is disabled or has no valid subscription provider.",
      );
    }
    const existing = this.curators.get(selected);
    if (existing) return existing;
    const curator = await this.curatorFactory.create(selected);
    this.curators.set(selected, curator);
    return curator;
  }

  private async ensureWorker(
    runtime: MemoryRuntime,
  ): Promise<SubconsciousWorker | undefined> {
    const settings = await this.settings.get();
    if (settings.curator === "off") return undefined;
    if (this.worker) return this.worker;
    const sourceId = await this.settings.getSourceId();
    const dynamicCurator: RestrictedMemoryCurator = {
      curate: async (input) => {
        const activeProvider = [...input.turns]
          .reverse()
          .map((turn) => turn.providerId)
          .find((value) => providerId(value ?? ""));
        return (await this.resolveCurator(activeProvider)).curate(input);
      },
    };
    this.worker = runtime.createSubconsciousWorker(dynamicCurator, {
      sourceId,
      schedule: settings.schedule,
      batchSize: settings.batchSize,
      idleMs: settings.idleMs,
      jobRepository: this.jobs,
      candidateRepository: this.candidates,
    });
    await this.worker.initialize();
    return this.worker;
  }

  async prepareTurn(
    input: PrepareMemoryTurnInput,
  ): Promise<PreparedMemoryTurn> {
    return this.lifecycle.run(() => this.prepareTurnUnlocked(input));
  }

  private async prepareTurnUnlocked(
    input: PrepareMemoryTurnInput,
  ): Promise<PreparedMemoryTurn> {
    const settings = await this.settings.get();
    if (settings.provider === "off") {
      return {
        additionalTools: [],
        forceNewSession: false,
        memoryCursors: { ...(input.bindingCursors ?? {}) },
      };
    }

    const runtime = await this.ensureRuntimeUnlocked();
    const sourceId = await this.settings.getSourceId();
    const scopes = this.scopes({
      conversationId: input.conversationId,
      providerId: input.providerId,
      workingDirectory: input.workingDirectory,
    });
    const snapshots = (
      await Promise.all(
        scopes.map(async (scope) => {
          try {
            return await runtime.store.getSnapshot(scope);
          } catch {
            return undefined;
          }
        }),
      )
    ).filter((snapshot) => snapshot !== undefined);
    const compiled = runtime.contextCompiler.compile({
      snapshots,
      session: {
        isNew: input.isNewSession,
        seen: input.bindingCursors ?? {},
      },
      budget: this.budget ?? DEFAULT_CONTEXT_BUDGET,
    });
    const conversationSnapshot = snapshots.find(
      (snapshot) => snapshot.scope.kind === "conversation",
    );
    if (conversationSnapshot) {
      await this.onConversationMemoryObserved?.(input.conversationId, {
        memoryVersion: conversationSnapshot.version,
        memoryEpoch: conversationSnapshot.epoch,
      });
    }
    const activeScope = scopes.find(
      (scope) => scope.kind === "conversation",
    ) as MemoryScope;
    const additionalTools = createMemoryAgentTools({
      store: runtime.store,
      sourceId,
      activeScope,
      allowedScopes: scopes,
      turnId: input.turnId,
      providerId: input.providerId,
      candidateSink: this.candidates,
      requestApproval: async (request) => ({
        approved: await input.requestApproval({
          name: "memory:forget",
          prompt: request.prompt,
          input: request,
        }),
      }),
    });
    return {
      systemContext: compiled.context || undefined,
      additionalTools,
      contextToken: {
        kind: "convera-memory-turn",
        sourceId,
        turnId: input.turnId,
        conversationId: input.conversationId,
        revision: input.revision,
        scopes,
      },
      forceNewSession: compiled.requiresNewSession,
      memoryCursors: compiled.cursors,
    };
  }

  async completeTurn(input: CompleteMemoryTurnInput): Promise<string[]> {
    return this.lifecycle.run(() => this.completeTurnUnlocked(input));
  }

  private async completeTurnUnlocked(
    input: CompleteMemoryTurnInput,
  ): Promise<string[]> {
    const settings = await this.settings.get();
    if (settings.provider === "off" || settings.curator === "off") {
      throw new MemoryError(
        "Memory curation is disabled. The durable turn remains paused until memory and its curator are enabled.",
        "CONFIGURATION",
        false,
      );
    }
    const currentSourceId = await this.settings.getSourceId();
    const sourceId = input.token.sourceId;
    if (!sourceId || sourceId !== currentSourceId) {
      throw new MemoryError(
        "Durable memory work belongs to a different or legacy Letta source.",
        "CONFIGURATION",
        false,
      );
    }
    const runtime = await this.ensureRuntimeUnlocked();
    const worker = await this.ensureWorker(runtime);
    if (!worker) {
      throw new MemoryError(
        "Memory curation is unavailable. The durable turn remains paused.",
        "CONFIGURATION",
        false,
      );
    }
    const candidates = await this.candidates.listByTurn(input.turnId, sourceId);
    const conversationScope = input.token.scopes.find(
      (scope) => scope.kind === "conversation",
    );
    const scopesToCurate = input.token.scopes.filter(
      (scope) =>
        scope.kind === "conversation" ||
        candidates.some((candidate) => sameMemoryScope(candidate.scope, scope)),
    );
    const jobIds: string[] = [];
    for (const scope of scopesToCurate) {
      const scopedCandidates = candidates.filter((candidate) =>
        sameMemoryScope(candidate.scope, scope),
      );
      const turn: CompletedMemoryTurn = {
        turnId: `${input.turnId}:${scope.kind}`,
        sourceId,
        conversationId: input.token.conversationId,
        candidateTurnId: input.turnId,
        scope,
        userContent: input.userContent,
        assistantContent: input.assistantContent,
        completedAt: input.completedAt ?? this.now().toISOString(),
        providerId: input.providerId,
        candidates: scopedCandidates,
        eligibleForMemory:
          (conversationScope !== undefined &&
            sameMemoryScope(conversationScope, scope) &&
            (input.userContent.trim().length > 0 ||
              input.assistantContent.trim().length > 0)) ||
          scopedCandidates.length > 0,
      };
      jobIds.push(await worker.enqueue(turn));
    }
    return jobIds;
  }

  async prepareTurnContext(
    input: LocalAiTurnHookInput,
  ): Promise<PreparedLocalAiTurnContext> {
    const prepared = await this.prepareTurn({
      turnId: input.request.turnId,
      conversationId: input.request.conversationId,
      providerId: input.request.providerId,
      revision: input.prepared.turn.revision,
      workingDirectory: input.request.options?.cwd,
      isNewSession: input.prepared.binding === undefined,
      bindingCursors: input.prepared.binding?.memoryCursors,
      requestApproval: async (request) =>
        (
          await input.requestInteraction({
            kind: "approval",
            name: request.name,
            prompt: request.prompt,
            input: request.input,
            options: ["Allow once", "Deny"],
          })
        ).approved === true,
    });
    return prepared;
  }

  async onTurnCompleted(input: LocalAiCompletedTurn): Promise<void> {
    if (!isMemoryToken(input.contextToken)) return;
    await this.completeTurn({
      token: input.contextToken,
      turnId: input.request.turnId,
      providerId: input.request.providerId,
      userContent: userContent(input.request),
      assistantContent: input.assistantText,
    });
  }

  prepareDurableTurnHook(input: {
    request: LocalAIChatRequest;
    prepared: { turn: { revision: number } };
    contextToken?: unknown;
  }): DurableMemoryTurnHookPayload | undefined {
    if (!isMemoryToken(input.contextToken)) return undefined;
    const durableProviderId = providerId(input.request.providerId);
    if (!durableProviderId) return undefined;
    return {
      kind: "memory-turn",
      sourceId: input.contextToken.sourceId,
      turnId: input.request.turnId,
      conversationId: input.request.conversationId,
      revision: input.prepared.turn.revision,
      providerId: durableProviderId,
      scopes: input.contextToken.scopes,
      userContent: userContent(input.request),
    };
  }

  async replayDurableTurnHook(hook: DurableTurnHookRecord): Promise<void> {
    if (hook.payload.kind !== "memory-turn") return;
    if (hook.outcome === "failed") {
      if (!hook.payload.sourceId) {
        throw new MemoryError(
          "Legacy memory cleanup has no Letta source and remains quarantined.",
          "CONFIGURATION",
          false,
        );
      }
      await this.candidates.deleteByTurn(hook.turnId, hook.payload.sourceId);
      return;
    }
    if (hook.outcome !== "completed") {
      throw new MemoryError(
        `Memory hook is not terminal: ${hook.hookId}`,
        "VALIDATION",
        false,
      );
    }
    await this.completeTurn({
      token: {
        kind: "convera-memory-turn",
        sourceId: hook.payload.sourceId,
        turnId: hook.payload.turnId,
        conversationId: hook.payload.conversationId,
        revision: hook.payload.revision,
        scopes: hook.payload.scopes,
      },
      turnId: hook.payload.turnId,
      providerId: hook.payload.providerId,
      userContent: hook.payload.userContent,
      assistantContent: hook.payload.assistantContent ?? "",
      completedAt: hook.terminalAt,
    });
  }

  async onTurnFailed(input: LocalAiFailedTurn): Promise<void> {
    if (!isMemoryToken(input.contextToken)) return;
    if (!input.contextToken.sourceId) return;
    await this.candidates.deleteByTurn(
      input.request.turnId,
      input.contextToken.sourceId,
    );
  }

  async getMemorySettings(): Promise<LocalAIMemorySettings> {
    return publicSettings(await this.settings.get());
  }

  async updateMemorySettings(
    update: LocalAIMemorySettingsUpdate,
  ): Promise<LocalAIMemorySettings> {
    return this.lifecycle.run(async () => {
      const previous = await this.settings.get();
      const settingsUpdate = {
        provider: update.provider,
        baseURL:
          update.baseURL === undefined
            ? undefined
            : update.baseURL.trim() || null,
        curator: update.subconsciousProvider,
        schedule: update.schedule,
        batchSize: update.batchSize,
        idleMs: update.idleDelayMs,
        apiKey: update.clearApiKey ? null : update.apiKey,
      };
      const [previousSourceId, nextSourceId, indexes] = await Promise.all([
        this.settings.getSourceId(),
        this.settings.getSourceId(settingsUpdate),
        this.indexes.list(),
      ]);
      const sourceChanged = previousSourceId !== nextSourceId;
      if (sourceChanged && indexes.some(hasRemoteMemory)) {
        throw new MemoryError(
          "This Letta source still owns remote or pending memory. Forget it with the current source before changing the base URL or API key.",
          "CONFIGURATION",
          false,
        );
      }
      const contextSourceChanged =
        previous.provider !== (update.provider ?? previous.provider) ||
        sourceChanged;
      await this.stopWorker(false);
      await this.runtime?.store.quiesce();
      if (sourceChanged && (await this.indexes.list()).some(hasRemoteMemory)) {
        this.generation += 1;
        this.runtime = undefined;
        this.runtimeGeneration = -1;
        await this.disposeCurators();
        throw new MemoryError(
          "Memory changed while the Letta source switch was quiescing. Retry only after forgetting it with the current source.",
          "CONFIGURATION",
          false,
        );
      }
      this.generation += 1;
      this.runtime = undefined;
      this.runtimeGeneration = -1;
      await this.disposeCurators();
      if (contextSourceChanged) {
        await this.onMemoryContextChanged?.();
      }
      const updated = await this.settings.update(settingsUpdate);
      return publicSettings(updated);
    });
  }

  async getMemoryStatus(conversationId?: string): Promise<LocalAIMemoryStatus> {
    return this.lifecycle.run(() =>
      this.getMemoryStatusUnlocked(conversationId),
    );
  }

  private async getMemoryStatusUnlocked(
    conversationId?: string,
  ): Promise<LocalAIMemoryStatus> {
    const settings = await this.settings.get();
    let runtime: MemoryRuntime | undefined;
    let startupError: unknown;
    if (settings.provider !== "off") {
      try {
        runtime = await this.ensureRuntimeUnlocked();
        if (settings.curator !== "off") {
          await this.ensureWorker(runtime);
        }
      } catch (error) {
        startupError = error;
      }
    }
    const persistedJobs = await this.jobs.list();
    const relevantJobs = conversationId
      ? persistedJobs.filter(
          (job) => job.turn.conversationId === conversationId,
        )
      : persistedJobs;
    if (settings.provider === "off") {
      return {
        health: "disabled",
        detail: "Memory is disabled.",
        pendingJobs: relevantJobs.filter((job) =>
          ["queued", "running"].includes(job.state.status),
        ).length,
        failedJobs: relevantJobs.filter((job) => job.state.status === "failed")
          .length,
      };
    }
    if (startupError || !runtime) {
      return {
        health: "error",
        detail:
          startupError instanceof Error
            ? startupError.message
            : String(startupError),
        pendingJobs: relevantJobs.filter((job) =>
          ["queued", "running"].includes(job.state.status),
        ).length,
        failedJobs: relevantJobs.filter((job) => job.state.status === "failed")
          .length,
      };
    }
    try {
      const status = await runtime.store.getStatus();
      const conversation = conversationId
        ? status.scopes.find(
            (entry) =>
              entry.scope.kind === "conversation" &&
              entry.scope.id === conversationId,
          )
        : undefined;
      const pendingJobs = relevantJobs.filter((job) =>
        ["queued", "running"].includes(job.state.status),
      ).length;
      const relevantScopes = conversationId
        ? status.scopes.filter(
            (entry) =>
              entry.scope.kind === "conversation" &&
              entry.scope.id === conversationId,
          )
        : status.scopes;
      return {
        health: status.health.available
          ? pendingJobs > 0 ||
            relevantScopes.some((scope) => scope.pendingWrites)
            ? "degraded"
            : "healthy"
          : relevantScopes.some((scope) => scope.cached)
            ? "degraded"
            : "offline",
        detail: status.health.detail,
        memoryVersion: conversation?.version,
        pendingJobs,
        failedJobs: relevantJobs.filter((job) => job.state.status === "failed")
          .length,
        lastSuccessfulSyncAt: status.health.available
          ? status.health.checkedAt
          : undefined,
      };
    } catch (error) {
      return {
        health: "error",
        detail: error instanceof Error ? error.message : String(error),
        pendingJobs: relevantJobs.filter((job) =>
          ["queued", "running"].includes(job.state.status),
        ).length,
        failedJobs: relevantJobs.filter((job) => job.state.status === "failed")
          .length,
      };
    }
  }

  async branchConversation(
    request: LocalAIBranchConversationRequest,
  ): Promise<void> {
    await this.lifecycle.run(() => this.branchConversationUnlocked(request));
  }

  private async branchConversationUnlocked(
    request: LocalAIBranchConversationRequest,
  ): Promise<void> {
    if ((await this.settings.get()).provider === "off") return;
    const runtime = await this.ensureRuntimeUnlocked();
    const targetScope: MemoryScope = {
      kind: "conversation",
      id: request.targetConversationId,
    };
    const target = await runtime.store
      .getSnapshot(targetScope)
      .catch(() => undefined);
    const checkpoint = request.bootstrapMessages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")
      .slice(-12_000);
    const turnId = `branch:${request.targetConversationId}:${this.now().getTime()}`;
    await runtime.store.applyPatch({
      scope: targetScope,
      baseVersion: target?.version ?? 0,
      turnId,
      provenance: {
        actor: "system",
        turnId,
        timestamp: this.now().toISOString(),
      },
      operations: [
        {
          type: "set_checkpoint",
          // The source memory is its latest state, not its state at
          // throughMessageId. Rebuild solely from the already-truncated
          // transcript so facts learned after the branch point cannot leak.
          value: checkpoint,
        },
      ],
    });
  }

  async deleteConversation(
    request: Omit<LocalAIDeleteConversationRequest, "leaseToken">,
  ): Promise<void> {
    await this.lifecycle.run(() => this.deleteConversationUnlocked(request));
  }

  private async deleteConversationUnlocked(
    request: Omit<LocalAIDeleteConversationRequest, "leaseToken">,
  ): Promise<void> {
    const scope: MemoryScope = {
      kind: "conversation",
      id: request.conversationId,
    };
    const settings = await this.settings.get();
    const indexedMemory = await this.indexes.get(scope);
    if (
      request.forgetConversationMemory &&
      settings.provider !== "letta" &&
      indexedMemory !== undefined &&
      hasRemoteMemory(indexedMemory)
    ) {
      throw new MemoryError(
        "This conversation has persisted memory. Enable its Letta provider before deleting it so the remote memory can also be forgotten.",
        "CONFIGURATION",
        false,
      );
    }
    const worker = this.worker;
    this.worker = undefined;
    if (worker) {
      await worker.cancelScope(scope);
      await worker.stop();
    }
    await Promise.all([
      this.candidates.deleteByScope(scope),
      this.jobs.deleteByScope(scope),
    ]);
    if (
      request.forgetConversationMemory &&
      indexedMemory &&
      isEmptyMemoryTombstone(indexedMemory)
    ) {
      // A renderer can replay deletion after losing the main-process response,
      // including after memory forget committed but session deletion failed.
      // Candidate/job cleanup above remains repeatable, while the durable empty
      // tombstone proves remote deletion and native-session rotation completed.
      return;
    }
    if (request.forgetConversationMemory && settings.provider === "letta") {
      const runtime = await this.ensureRuntimeUnlocked();
      await runtime.store.forget({
        scope,
        target: { type: "scope" },
        reason: "Conversation deletion requested memory removal.",
        turnId: request.operationId
          ? `delete:${request.operationId}`
          : `delete:${request.conversationId}:${this.now().getTime()}`,
        approved: true,
      });
    } else if (
      request.forgetConversationMemory &&
      indexedMemory &&
      !isEmptyMemoryTombstone(indexedMemory)
    ) {
      await this.indexes.put({
        ...indexedMemory,
        revision: indexedMemory.revision + 1,
        version: indexedMemory.version + 1,
        epoch: indexedMemory.epoch + 1,
        blockIds: {},
        checkpoint: undefined,
        lastKnownGood: undefined,
        appliedTurns: {},
        corrections: [],
        deltas: [],
        pendingWrites: [],
        pendingForgets: [],
        agentId: undefined,
        archiveId: undefined,
      });
    }
    if (request.forgetConversationMemory && settings.provider !== "letta") {
      await this.onMemoryScopeForgotten?.(scope);
    }
  }

  async resetConversationProviderSession(): Promise<void> {
    // Provider session rotation is owned by SessionStateRepository. A fresh
    // binding has no cursors, so prepareTurn naturally emits a full bootstrap.
  }

  async dispose(): Promise<void> {
    await this.lifecycle.run(async () => {
      await this.stopWorker(false);
      await this.runtime?.store.quiesce();
      this.generation += 1;
      this.runtime = undefined;
      this.runtimeGeneration = -1;
      await this.disposeCurators();
    });
  }

  async flushSubconscious(): Promise<void> {
    await this.lifecycle.run(async () => {
      const settings = await this.settings.get();
      if (settings.provider === "off" || settings.curator === "off") return;
      const runtime = await this.ensureRuntimeUnlocked();
      const worker = await this.ensureWorker(runtime);
      await worker?.flush();
    });
  }

  private async stopWorker(flush: boolean): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    if (!worker) return;
    if (flush) await worker.flush().catch(() => undefined);
    await worker.stop();
  }

  private async disposeCurators(): Promise<void> {
    const curators = [...this.curators.values()];
    this.curators.clear();
    await Promise.allSettled(
      curators.map((curator) => Promise.resolve(curator.dispose?.())),
    );
  }
}
