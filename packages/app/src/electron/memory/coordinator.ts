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
import type { ProviderMemoryCursors } from "../ai/session/types";
import type { LocalAiProviderId } from "../ai/types";
import type { MemoryCandidateRepository } from "./candidate-sink";
import type { MemoryIndexRepository } from "./index-repository";
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
  private runtime?: MemoryRuntime;
  private worker?: SubconsciousWorker;
  private readonly curators = new Map<
    LocalAiProviderId,
    RestrictedMemoryCurator
  >();

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

  private async ensureRuntime(): Promise<MemoryRuntime> {
    if (this.runtime) return this.runtime;
    const api = await this.apiFactory(this.settings);
    this.runtime = createMemoryRuntime({
      api,
      indexRepository: this.indexes,
    });
    return this.runtime;
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
    const settings = await this.settings.get();
    if (settings.provider === "off") {
      return {
        additionalTools: [],
        forceNewSession: false,
        memoryCursors: { ...(input.bindingCursors ?? {}) },
      };
    }

    const runtime = await this.ensureRuntime();
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
    const activeScope = scopes.find(
      (scope) => scope.kind === "conversation",
    ) as MemoryScope;
    const additionalTools = createMemoryAgentTools({
      store: runtime.store,
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
    const settings = await this.settings.get();
    if (settings.provider === "off" || settings.curator === "off") return [];
    const runtime = await this.ensureRuntime();
    const worker = await this.ensureWorker(runtime);
    if (!worker) return [];
    const candidates = await this.candidates.listByTurn(input.turnId);
    const conversationScope = input.token.scopes.find(
      (scope) => scope.kind === "conversation",
    );
    const scopesToCurate = input.token.scopes.filter(
      (scope) =>
        scope.kind === "conversation" ||
        candidates.some((candidate) =>
          sameMemoryScope(candidate.scope, scope),
        ),
    );
    const jobIds: string[] = [];
    for (const scope of scopesToCurate) {
      const scopedCandidates = candidates.filter((candidate) =>
        sameMemoryScope(candidate.scope, scope),
      );
      const turn: CompletedMemoryTurn = {
        turnId: `${input.turnId}:${scope.kind}`,
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

  async onTurnFailed(input: LocalAiFailedTurn): Promise<void> {
    if (!isMemoryToken(input.contextToken)) return;
    await this.candidates.deleteByTurn(input.request.turnId);
  }

  async getMemorySettings(): Promise<LocalAIMemorySettings> {
    return publicSettings(await this.settings.get());
  }

  async updateMemorySettings(
    update: LocalAIMemorySettingsUpdate,
  ): Promise<LocalAIMemorySettings> {
    await this.stopWorker(false);
    this.runtime = undefined;
    this.curators.clear();
    const updated = await this.settings.update({
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
    });
    return publicSettings(updated);
  }

  async getMemoryStatus(conversationId?: string): Promise<LocalAIMemoryStatus> {
    const settings = await this.settings.get();
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
    try {
      const status = await (await this.ensureRuntime()).store.getStatus();
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
      return {
        health: status.health.available
          ? pendingJobs > 0 ||
            status.scopes.some((scope) => scope.pendingWrites)
            ? "degraded"
            : "healthy"
          : status.scopes.some((scope) => scope.cached)
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
    if ((await this.settings.get()).provider === "off") return;
    const runtime = await this.ensureRuntime();
    const sourceScope: MemoryScope = {
      kind: "conversation",
      id: request.sourceConversationId,
    };
    const targetScope: MemoryScope = {
      kind: "conversation",
      id: request.targetConversationId,
    };
    const [source, target] = await Promise.all([
      runtime.store.getSnapshot(sourceScope).catch(() => undefined),
      runtime.store.getSnapshot(targetScope).catch(() => undefined),
    ]);
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
        ...(source?.blocks.map((block) => ({
          type: "upsert_block" as const,
          label: block.label,
          value: block.value,
          description: block.description,
          limit: block.limit,
        })) ?? []),
        {
          type: "set_checkpoint",
          value: checkpoint || source?.checkpoint || "",
        },
      ],
    });
  }

  async deleteConversation(
    request: LocalAIDeleteConversationRequest,
  ): Promise<void> {
    const scope: MemoryScope = {
      kind: "conversation",
      id: request.conversationId,
    };
    await this.stopWorker(false);
    await Promise.all([
      this.candidates.deleteByScope(scope),
      this.jobs.deleteByScope(scope),
    ]);
    if (
      request.forgetConversationMemory &&
      (await this.settings.get()).provider === "letta"
    ) {
      const runtime = await this.ensureRuntime();
      await runtime.store.forget({
        scope,
        target: { type: "scope" },
        reason: "Conversation deletion requested memory removal.",
        turnId: `delete:${request.conversationId}:${this.now().getTime()}`,
        approved: true,
      });
    }
  }

  async resetConversationProviderSession(): Promise<void> {
    // Provider session rotation is owned by SessionStateRepository. A fresh
    // binding has no cursors, so prepareTurn naturally emits a full bootstrap.
  }

  async dispose(): Promise<void> {
    await this.stopWorker(false);
  }

  async flushSubconscious(): Promise<void> {
    await this.worker?.flush();
  }

  private async stopWorker(flush: boolean): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    if (!worker) return;
    if (flush) await worker.flush().catch(() => undefined);
    worker.dispose();
  }
}
