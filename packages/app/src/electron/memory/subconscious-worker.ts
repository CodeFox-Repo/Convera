import type { MemoryCandidateRepository } from "./candidate-sink";
import { errorMessage, MemoryError } from "./errors";
import {
  type PersistedSubconsciousJob,
  type SubconsciousJobRepository,
} from "./subconscious-job-repository";
import {
  memoryScopeKey,
  sameMemoryScope,
  type ApplyPatchResult,
  type MemoryCandidate,
  type MemoryScope,
  type MemorySnapshot,
  type MemoryStore,
  validateMemoryPatch,
} from "./types";

export type SubconsciousSchedule = "every-turn" | "batch" | "idle";

export interface CompletedMemoryTurn {
  turnId: string;
  conversationId?: string;
  candidateTurnId?: string;
  scope: MemoryScope;
  userContent: string;
  assistantContent: string;
  completedAt: string;
  providerId?: string;
  candidates?: MemoryCandidate[];
  eligibleForMemory?: boolean;
}

export interface CuratorInput {
  jobId: string;
  expectedPatchTurnId: string;
  scope: MemoryScope;
  baseVersion: number;
  snapshot: MemorySnapshot;
  turns: CompletedMemoryTurn[];
  allowedCapabilities: readonly [
    "memory_read",
    "memory_search",
    "memory_apply_patch",
  ];
}

/**
 * Implementations may call a provider, but receive no shell, CUA, filesystem,
 * or general MCP capability through this contract.
 */
export interface RestrictedMemoryCurator {
  curate(input: CuratorInput): Promise<unknown>;
  dispose?(): Promise<void> | void;
}

export interface MemoryCuratorNoopDecision {
  action: "noop";
  reason: string;
}

export type MemoryCuratorDecision =
  | MemoryCuratorNoopDecision
  | ReturnType<typeof validateMemoryPatch>;

export interface SubconsciousScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  sleep(delayMs: number): Promise<void>;
}

export interface SubconsciousWorkerOptions {
  store: MemoryStore;
  curator: RestrictedMemoryCurator;
  schedule: SubconsciousSchedule;
  batchSize?: number;
  idleMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  scheduler?: SubconsciousScheduler;
  now?: () => Date;
  jobRepository: SubconsciousJobRepository;
  candidateRepository?: Pick<MemoryCandidateRepository, "deleteByIds">;
}

export interface SubconsciousJobState {
  id: string;
  turnIds: string[];
  scope: MemoryScope;
  status: "queued" | "running" | "completed" | "failed" | "skipped";
  attempts: number;
  error?: string;
  reason?: string;
  result?: ApplyPatchResult;
}

interface QueuedTurn {
  id: string;
  turn: CompletedMemoryTurn;
}

function defaultScheduler(): SubconsciousScheduler {
  return {
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    clearTimeout: (handle) =>
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    sleep: (delayMs) =>
      new Promise((resolve) => globalThis.setTimeout(resolve, delayMs)),
  };
}

function parseCuratorDecision(value: unknown): MemoryCuratorDecision {
  if (
    typeof value === "object" &&
    value !== null &&
    "action" in value &&
    value.action === "noop"
  ) {
    const reason =
      "reason" in value && typeof value.reason === "string"
        ? value.reason.trim()
        : "";
    if (!reason) {
      throw new MemoryError(
        "A curator noop decision requires a non-empty reason.",
        "VALIDATION",
        false,
      );
    }
    return { action: "noop", reason };
  }
  return validateMemoryPatch(value);
}

export class SubconsciousWorker {
  private readonly store: MemoryStore;
  private readonly curator: RestrictedMemoryCurator;
  private readonly schedule: SubconsciousSchedule;
  private readonly batchSize: number;
  private readonly idleMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly scheduler: SubconsciousScheduler;
  private readonly now: () => Date;
  private readonly jobRepository: SubconsciousJobRepository;
  private readonly candidateRepository?: Pick<
    MemoryCandidateRepository,
    "deleteByIds"
  >;
  private readonly queue: QueuedTurn[] = [];
  private readonly states = new Map<string, SubconsciousJobState>();
  private readonly cancelledScopes = new Set<string>();
  private sequence = 0;
  private drainPromise?: Promise<void>;
  private idleHandle?: unknown;
  private disposed = false;
  private readonly ready: Promise<void>;

  constructor(options: SubconsciousWorkerOptions) {
    this.store = options.store;
    this.curator = options.curator;
    this.schedule = options.schedule;
    this.batchSize = Math.max(options.batchSize ?? 5, 1);
    this.idleMs = Math.max(options.idleMs ?? 5_000, 0);
    this.maxAttempts = Math.max(options.maxAttempts ?? 3, 1);
    this.retryBaseMs = Math.max(options.retryBaseMs ?? 250, 0);
    this.scheduler = options.scheduler ?? defaultScheduler();
    this.now = options.now ?? (() => new Date());
    this.jobRepository = options.jobRepository;
    this.candidateRepository = options.candidateRepository;
    this.ready = this.hydrate();
  }

  private async hydrate(): Promise<void> {
    const persisted = await this.jobRepository.list();
    for (const job of persisted) {
      const numeric = Number(job.state.id.replace(/^memory-job-/, ""));
      if (Number.isFinite(numeric))
        this.sequence = Math.max(this.sequence, numeric);
      const state = structuredClone(job.state);
      if (state.status === "running" || state.status === "queued") {
        state.status = "queued";
        state.error =
          job.state.status === "running"
            ? "Recovered an interrupted subconscious job after restart."
            : state.error;
        this.queue.push({
          id: state.id,
          turn: structuredClone(job.turn),
        });
        await this.jobRepository.put({
          ...job,
          state,
          updatedAt: this.now().toISOString(),
        });
      }
      this.states.set(state.id, state);
    }
    if (this.queue.length > 0) {
      queueMicrotask(() => void this.startDrain(true));
    }
  }

  async initialize(): Promise<void> {
    await this.ready;
  }

  async enqueue(turn: CompletedMemoryTurn): Promise<string> {
    await this.ready;
    if (this.disposed) {
      throw new MemoryError(
        "Cannot enqueue memory work after the subconscious worker is disposed.",
        "VALIDATION",
        false,
      );
    }
    this.sequence += 1;
    const id = `memory-job-${this.sequence}`;
    const initialStatus =
      turn.eligibleForMemory === false ? "skipped" : "queued";
    this.states.set(id, {
      id,
      turnIds: [turn.turnId],
      scope: turn.scope,
      status: initialStatus,
      attempts: 0,
      error:
        initialStatus === "skipped"
          ? "Turn was not eligible for memory consolidation."
          : undefined,
    });
    await this.jobRepository.put({
      state: structuredClone(this.states.get(id) as SubconsciousJobState),
      turn: structuredClone(turn),
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    });
    if (initialStatus === "skipped") return id;

    this.queue.push({ id, turn: structuredClone(turn) });
    this.scheduleDrain();
    return id;
  }

  private scheduleDrain(): void {
    if (this.schedule === "every-turn") {
      queueMicrotask(() => void this.startDrain(false));
      return;
    }
    if (this.schedule === "batch" && this.queue.length >= this.batchSize) {
      queueMicrotask(() => void this.startDrain(false));
      return;
    }
    if (this.schedule === "idle") {
      if (this.idleHandle !== undefined) {
        this.scheduler.clearTimeout(this.idleHandle);
      }
      this.idleHandle = this.scheduler.setTimeout(() => {
        this.idleHandle = undefined;
        void this.startDrain(true);
      }, this.idleMs);
    }
  }

  async flush(): Promise<void> {
    await this.ready;
    if (this.idleHandle !== undefined) {
      this.scheduler.clearTimeout(this.idleHandle);
      this.idleHandle = undefined;
    }
    await this.startDrain(true);
  }

  private async startDrain(force: boolean): Promise<void> {
    if (this.drainPromise) {
      await this.drainPromise;
      if (force && this.queue.length > 0) await this.startDrain(true);
      return;
    }
    this.drainPromise = this.drain(force).finally(() => {
      this.drainPromise = undefined;
    });
    await this.drainPromise;
  }

  private async drain(force: boolean): Promise<void> {
    while (!this.disposed && this.queue.length > 0) {
      if (
        !force &&
        this.schedule === "batch" &&
        this.queue.length < this.batchSize
      ) {
        return;
      }
      const first = this.queue[0];
      if (!first) return;
      const sameScope = this.queue.filter((queued) =>
        sameMemoryScope(queued.turn.scope, first.turn.scope),
      );
      const take =
        this.schedule === "every-turn"
          ? 1
          : Math.min(
              sameScope.length,
              force ? sameScope.length : this.batchSize,
            );
      const batch = sameScope.slice(0, take);
      const selected = new Set(batch.map((queued) => queued.id));
      for (let index = this.queue.length - 1; index >= 0; index -= 1) {
        const queued = this.queue[index];
        if (queued && selected.has(queued.id)) this.queue.splice(index, 1);
      }
      await this.processBatch(batch);
    }
  }

  private async processBatch(batch: QueuedTurn[]): Promise<void> {
    const first = batch[0];
    if (!first) return;
    if (this.disposed) return;
    if (this.cancelledScopes.has(memoryScopeKey(first.turn.scope))) {
      await this.skipBatch(batch, 0, "Memory scope was cancelled.");
      return;
    }
    const jobId =
      batch.length === 1
        ? first.id
        : `memory-batch-${first.id}-${batch.at(-1)?.id}`;
    const patchTurnId = `subconscious:${jobId}`;
    const aggregate: SubconsciousJobState = {
      id: jobId,
      turnIds: batch.map((queued) => queued.turn.turnId),
      scope: first.turn.scope,
      status: "running",
      attempts: 0,
    };
    this.states.set(jobId, aggregate);
    for (const queued of batch) {
      const state = this.states.get(queued.id);
      if (state) {
        state.status = "running";
        await this.persistState(queued, state);
      }
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (this.disposed) return;
      aggregate.attempts = attempt;
      try {
        const snapshot = await this.store.getSnapshot(first.turn.scope);
        const raw = await this.curator.curate({
          jobId,
          expectedPatchTurnId: patchTurnId,
          scope: first.turn.scope,
          baseVersion: snapshot.version,
          snapshot,
          turns: batch.map((queued) => structuredClone(queued.turn)),
          allowedCapabilities: [
            "memory_read",
            "memory_search",
            "memory_apply_patch",
          ],
        });
        if (this.cancelledScopes.has(memoryScopeKey(first.turn.scope))) {
          await this.skipBatch(
            batch,
            attempt,
            "Memory scope was cancelled before consolidation.",
          );
          return;
        }
        // Provider disposal aborts in-flight native subscription calls. Leave
        // the persisted job as running so the next worker can recover it,
        // rather than applying a result produced against an obsolete memory
        // provider or context source.
        if (this.disposed) return;
        const decision = parseCuratorDecision(raw);
        if ("action" in decision) {
          aggregate.status = "skipped";
          aggregate.reason = decision.reason;
          for (const queued of batch) {
            const state = this.states.get(queued.id);
            if (state) {
              state.status = "skipped";
              state.attempts = attempt;
              state.reason = decision.reason;
              state.error = undefined;
              await this.persistState(queued, state);
              await this.candidateRepository?.deleteByIds(
                (queued.turn.candidates ?? []).map((candidate) => candidate.id),
              );
            }
          }
          return;
        }
        const patch = decision;
        if (!sameMemoryScope(patch.scope, first.turn.scope)) {
          throw new MemoryError(
            `Curator returned scope ${memoryScopeKey(patch.scope)} for job ${memoryScopeKey(first.turn.scope)}.`,
            "VALIDATION",
            false,
          );
        }
        if (patch.turnId !== patchTurnId) {
          throw new MemoryError(
            `Curator patch turnId must be ${patchTurnId}.`,
            "VALIDATION",
            false,
          );
        }
        if (patch.baseVersion !== snapshot.version) {
          throw new MemoryError(
            `Curator patch baseVersion ${patch.baseVersion} does not match snapshot version ${snapshot.version}.`,
            "VALIDATION",
            true,
          );
        }
        if (patch.provenance.actor !== "subconscious") {
          throw new MemoryError(
            "Curator patches must use provenance.actor subconscious.",
            "VALIDATION",
            false,
          );
        }
        const result = await this.store.applyPatch(patch);
        if (result.status === "conflict") {
          throw new MemoryError(result.message, "CONFLICT", true);
        }
        aggregate.status = "completed";
        aggregate.result = result;
        for (const queued of batch) {
          const state = this.states.get(queued.id);
          if (state) {
            state.status = "completed";
            state.attempts = attempt;
            state.result = result;
            state.error = undefined;
            await this.persistState(queued, state);
            await this.candidateRepository?.deleteByIds(
              (queued.turn.candidates ?? []).map((candidate) => candidate.id),
            );
          }
        }
        return;
      } catch (error) {
        if (this.disposed) return;
        if (this.cancelledScopes.has(memoryScopeKey(first.turn.scope))) {
          await this.skipBatch(
            batch,
            attempt,
            "Memory scope was cancelled during consolidation.",
          );
          return;
        }
        lastError = error;
        if (error instanceof MemoryError && !error.retryable) {
          break;
        }
        if (attempt < this.maxAttempts) {
          await this.scheduler.sleep(
            this.retryBaseMs * Math.pow(2, attempt - 1),
          );
        }
      }
    }

    const message = errorMessage(lastError);
    aggregate.status = "failed";
    aggregate.error = message;
    for (const queued of batch) {
      const state = this.states.get(queued.id);
      if (state) {
        state.status = "failed";
        state.attempts = aggregate.attempts;
        state.error = message;
        await this.persistState(queued, state);
      }
    }
  }

  private async persistState(
    queued: QueuedTurn,
    state: SubconsciousJobState,
  ): Promise<void> {
    const existing = (await this.jobRepository.list()).find(
      (job) => job.state.id === state.id,
    );
    const timestamp = this.now().toISOString();
    const job: PersistedSubconsciousJob = {
      state: structuredClone(state),
      turn: structuredClone(queued.turn),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await this.jobRepository.put(job);
  }

  private async skipBatch(
    batch: QueuedTurn[],
    attempts: number,
    reason: string,
  ): Promise<void> {
    for (const queued of batch) {
      const state = this.states.get(queued.id);
      if (!state) continue;
      state.status = "skipped";
      state.attempts = attempts;
      state.reason = reason;
      state.error = undefined;
      await this.persistState(queued, state);
    }
  }

  async cancelScope(scope: MemoryScope): Promise<void> {
    await this.ready;
    const key = memoryScopeKey(scope);
    this.cancelledScopes.add(key);
    const removed = this.queue.filter((queued) =>
      sameMemoryScope(queued.turn.scope, scope),
    );
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const queued = this.queue[index];
      if (queued && sameMemoryScope(queued.turn.scope, scope)) {
        this.queue.splice(index, 1);
      }
    }
    await this.skipBatch(removed, 0, "Memory scope was cancelled.");
    if (this.drainPromise) await this.drainPromise;
  }

  getState(jobId: string): SubconsciousJobState | undefined {
    const state = this.states.get(jobId);
    return state ? structuredClone(state) : undefined;
  }

  listStates(): SubconsciousJobState[] {
    return [...this.states.values()].map((state) => structuredClone(state));
  }

  pendingCount(): number {
    return this.queue.length;
  }

  dispose(): void {
    this.disposed = true;
    if (this.idleHandle !== undefined) {
      this.scheduler.clearTimeout(this.idleHandle);
      this.idleHandle = undefined;
    }
  }

  diagnostics(): {
    schedule: SubconsciousSchedule;
    queued: number;
    generatedAt: string;
  } {
    return {
      schedule: this.schedule,
      queued: this.queue.length,
      generatedAt: this.now().toISOString(),
    };
  }
}
