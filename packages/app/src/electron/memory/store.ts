import { errorMessage, MemoryError } from "./errors";
import {
  createEmptyMemoryScopeIndex,
  type MemoryIndexRepository,
  type MemoryScopeIndex,
} from "./index-repository";
import type {
  LettaApi,
  LettaBlockRecord,
  LettaPassageRecord,
} from "./letta-api";
import { SerialTaskQueue } from "./serial-queue";
import {
  type ApplyPatchResult,
  type ForgetRequest,
  type ForgetResult,
  type MemoryBlock,
  type MemoryHealth,
  type MemoryPatch,
  type MemoryPatchOperation,
  type MemoryProvenance,
  type MemoryScope,
  type MemorySearchQuery,
  type MemorySearchResult,
  type MemorySnapshot,
  type MemoryStore,
  type MemoryStoreStatus,
  memoryScopeKey,
  sameMemoryScope,
  validateMemoryPatch,
} from "./types";

export interface LettaMemoryStoreOptions {
  api: LettaApi;
  indexRepository: MemoryIndexRepository;
  sourceId?: string;
  isActive?: () => boolean;
  now?: () => Date;
  maxDeltas?: number;
  maxAppliedTurns?: number;
  onScopeForgotten?: (scope: MemoryScope) => Promise<void> | void;
}

const BLOCK_TAG = "convera_memory_block";
const PASSAGE_TAG = "convera_memory_passage";

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function scopeTag(scope: MemoryScope): string {
  return `convera_scope_${scope.kind}_${stableHash(scope.id)}`;
}

function mutationTag(turnId: string, operationIndex: number): string {
  return `convera_mutation_${stableHash(`${turnId}:${operationIndex}`)}`;
}

function toIso(now: () => Date): string {
  return now().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataNumber(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number,
): number {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function provenanceFromBlock(
  block: LettaBlockRecord,
  now: () => Date,
): MemoryProvenance {
  const metadata = block.metadata;
  const actor = metadataString(metadata, "converaActor");
  return {
    actor:
      actor === "primary-agent" ||
      actor === "subconscious" ||
      actor === "user" ||
      actor === "system"
        ? actor
        : "system",
    turnId: metadataString(metadata, "converaTurnId") ?? "unknown",
    timestamp: metadataString(metadata, "converaTimestamp") ?? toIso(now),
    providerId: metadataString(metadata, "converaProviderId"),
    sourceMemoryId: metadataString(metadata, "converaSourceMemoryId"),
  };
}

function blockMetadata(
  scope: MemoryScope,
  version: number,
  provenance: MemoryProvenance,
): Record<string, unknown> {
  return {
    converaSchema: 1,
    converaScopeKind: scope.kind,
    converaScopeId: scope.id,
    converaVersion: version,
    converaActor: provenance.actor,
    converaTurnId: provenance.turnId,
    converaTimestamp: provenance.timestamp,
    converaProviderId: provenance.providerId,
    converaSourceMemoryId: provenance.sourceMemoryId,
  };
}

function memoryBlock(
  record: LettaBlockRecord,
  scope: MemoryScope,
  index: MemoryScopeIndex,
  now: () => Date,
): MemoryBlock {
  return {
    id: record.id,
    scope,
    label: record.label ?? "memory",
    value: record.value,
    description: record.description ?? undefined,
    limit: record.limit,
    version: metadataNumber(record.metadata, "converaVersion", index.version),
    provenance: provenanceFromBlock(record, now),
    updatedAt:
      metadataString(record.metadata, "converaTimestamp") ?? toIso(now),
  };
}

function operationSummary(operations: MemoryPatchOperation[]): string {
  return operations
    .map((operation) => {
      switch (operation.type) {
        case "upsert_block":
          return `updated block ${operation.label}`;
        case "insert_passage":
          return "added archival memory";
        case "correct_passage":
          return `corrected memory ${operation.memoryId}`;
        case "set_checkpoint":
          return "updated conversation checkpoint";
        case "increment_epoch":
          return `started a new memory epoch: ${operation.reason}`;
      }
    })
    .join("; ");
}

function changedLabels(operations: MemoryPatchOperation[]): string[] {
  return [
    ...new Set(
      operations.flatMap((operation) =>
        operation.type === "upsert_block" ? [operation.label] : [],
      ),
    ),
  ];
}

function isNotFoundError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error.status === 404 || error.statusCode === 404;
}

export class LettaMemoryStore implements MemoryStore {
  private readonly api: LettaApi;
  private readonly indexes: MemoryIndexRepository;
  private readonly sourceId?: string;
  private readonly isActive?: () => boolean;
  private readonly now: () => Date;
  private readonly maxDeltas: number;
  private readonly maxAppliedTurns: number;
  private readonly onScopeForgotten?: (
    scope: MemoryScope,
  ) => Promise<void> | void;
  private readonly writes = new SerialTaskQueue();
  private quiescing = false;

  constructor(options: LettaMemoryStoreOptions) {
    this.api = options.api;
    this.indexes = options.indexRepository;
    this.sourceId = options.sourceId;
    this.isActive = options.isActive;
    this.now = options.now ?? (() => new Date());
    this.maxDeltas = options.maxDeltas ?? 100;
    this.maxAppliedTurns = options.maxAppliedTurns ?? 1_000;
    this.onScopeForgotten = options.onScopeForgotten;
  }

  private assertActive(): void {
    if (this.quiescing || (this.isActive && !this.isActive())) {
      throw new MemoryError(
        "This Letta memory runtime was superseded by a settings change.",
        "CONFLICT",
        false,
      );
    }
  }

  async quiesce(): Promise<void> {
    this.quiescing = true;
    await this.writes.idle();
  }

  private hasSourceState(index: MemoryScopeIndex): boolean {
    return (
      Object.keys(index.blockIds).length > 0 ||
      index.archiveId !== undefined ||
      index.agentId !== undefined ||
      index.pendingWrites.length > 0 ||
      index.pendingForgets.length > 0
    );
  }

  private async ensureIndexSource(index: MemoryScopeIndex): Promise<void> {
    this.assertActive();
    if (!this.sourceId || index.sourceId === this.sourceId) return;
    if (this.hasSourceState(index)) {
      throw new MemoryError(
        index.sourceId
          ? `Memory scope ${memoryScopeKey(index.scope)} belongs to a different Letta source. Forget or migrate it with the original source before switching.`
          : `Memory scope ${memoryScopeKey(index.scope)} predates Letta source binding and still contains remote or pending state. Explicitly migrate it from the verified original source before using these remote IDs.`,
        "CONFIGURATION",
        false,
      );
    }
    index.sourceId = this.sourceId;
    index.revision += 1;
    await this.indexes.put(index);
  }

  private normalizeJournal(index: MemoryScopeIndex): boolean {
    const entries = [
      ...index.pendingWrites.map((entry, order) => ({
        entry,
        queuedAt: entry.queuedAt,
        order,
      })),
      ...index.pendingForgets.map((entry, order) => ({
        entry,
        queuedAt: entry.queuedAt,
        order: index.pendingWrites.length + order,
      })),
    ];
    const highestAssigned = Math.max(
      ...entries.map((item) => item.entry.journalSequence ?? 0),
      0,
    );
    let next = Math.max(index.nextJournalSequence, highestAssigned + 1);
    let changed = false;
    for (const item of entries
      .filter((candidate) => candidate.entry.journalSequence === undefined)
      .sort(
        (left, right) =>
          left.queuedAt.localeCompare(right.queuedAt) ||
          left.order - right.order,
      )) {
      item.entry.journalSequence = next;
      next += 1;
      changed = true;
    }
    const requiredNext = Math.max(next, index.nextJournalSequence);
    if (index.nextJournalSequence !== requiredNext) {
      index.nextJournalSequence = requiredNext;
      changed = true;
    }
    return changed;
  }

  private allocateJournalSequence(index: MemoryScopeIndex): number {
    this.normalizeJournal(index);
    const sequence = index.nextJournalSequence;
    index.nextJournalSequence += 1;
    return sequence;
  }

  async health(): Promise<MemoryHealth> {
    const started = Date.now();
    try {
      this.assertActive();
      await this.api.health();
      return {
        available: true,
        checkedAt: toIso(this.now),
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        available: false,
        checkedAt: toIso(this.now),
        latencyMs: Date.now() - started,
        detail: errorMessage(error),
      };
    }
  }

  async getSnapshot(scope: MemoryScope): Promise<MemorySnapshot> {
    return this.writes.run(async () => {
      const index =
        (await this.indexes.get(scope)) ?? createEmptyMemoryScopeIndex(scope);
      await this.ensureIndexSource(index);
      try {
        const records = await Promise.all(
          Object.values(index.blockIds).map((blockId) =>
            this.api.retrieveBlock(blockId),
          ),
        );
        const snapshot: MemorySnapshot = {
          scope,
          version: index.version,
          epoch: index.epoch,
          blocks: records
            .map((record) => memoryBlock(record, scope, index, this.now))
            .sort((left, right) => left.label.localeCompare(right.label)),
          deltas: structuredClone(index.deltas),
          checkpoint: index.checkpoint,
          retrievedAt: toIso(this.now),
          stale: false,
          pendingTurnIds: index.pendingWrites.map(
            (pending) => pending.patch.turnId,
          ),
        };
        index.lastKnownGood = snapshot;
        index.revision += 1;
        await this.indexes.put(index);
        return structuredClone(snapshot);
      } catch (error) {
        if (index.lastKnownGood) {
          return {
            ...structuredClone(index.lastKnownGood),
            retrievedAt: toIso(this.now),
            stale: true,
            pendingTurnIds: index.pendingWrites.map(
              (pending) => pending.patch.turnId,
            ),
          };
        }
        throw new MemoryError(
          `Memory snapshot for ${memoryScopeKey(scope)} is unavailable: ${errorMessage(error)}`,
          "OFFLINE",
          true,
          { cause: error },
        );
      }
    });
  }

  async search(query: MemorySearchQuery): Promise<MemorySearchResult> {
    const maxResults = Math.min(Math.max(query.maxResults ?? 8, 1), 50);
    const hits: MemorySearchResult["hits"] = [];
    const errors: MemorySearchResult["errors"] = [];

    await Promise.all(
      query.scopes.map(async (scope) => {
        const index = await this.indexes.get(scope);
        if (!index?.archiveId && !index?.agentId) return;
        try {
          await this.ensureIndexSource(index);
          const records = index.archiveId
            ? await this.api.searchArchivePassages(index.archiveId, {
                query: query.query,
                tags: query.tags,
                maxResults,
                startDate: query.startDate,
                endDate: query.endDate,
              })
            : await this.api.searchPassages(index.agentId as string, {
                query: query.query,
                tags: query.tags,
                maxResults,
                startDate: query.startDate,
                endDate: query.endDate,
              });
          const correctionsByOriginal = new Map(
            index.corrections.map((correction) => [
              correction.originalId,
              correction,
            ]),
          );
          const correctionsByReplacement = new Map(
            index.corrections.map((correction) => [
              correction.replacementId,
              correction,
            ]),
          );
          for (const record of records) {
            if (
              !record.tags.includes(PASSAGE_TAG) ||
              !record.tags.includes(scopeTag(scope))
            ) {
              continue;
            }
            if (correctionsByOriginal.has(record.id)) continue;
            const correction = correctionsByReplacement.get(record.id);
            hits.push({
              id: record.id,
              scope,
              content: record.content,
              tags: record.tags,
              score: record.score,
              createdAt: record.createdAt,
              provenance: correction?.provenance,
              supersedes: correction?.originalId,
            });
          }
        } catch (error) {
          errors.push({ scope, message: errorMessage(error) });
        }
      }),
    );

    return {
      hits: hits
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
        .slice(0, maxResults),
      stale: errors.length > 0,
      errors,
    };
  }

  async applyPatch(patch: MemoryPatch): Promise<ApplyPatchResult> {
    const validated = validateMemoryPatch(patch);
    return this.writes.run(async () => {
      const index =
        (await this.indexes.get(validated.scope)) ??
        createEmptyMemoryScopeIndex(validated.scope);
      await this.ensureIndexSource(index);
      const appliedVersion = index.appliedTurns[validated.turnId];
      if (appliedVersion !== undefined) {
        return {
          status: "duplicate",
          scope: validated.scope,
          version: appliedVersion,
          turnId: validated.turnId,
          message: `Turn ${validated.turnId} was already consolidated at memory version ${appliedVersion}.`,
        };
      }
      if (validated.baseVersion !== index.version) {
        return {
          status: "conflict",
          scope: validated.scope,
          version: index.version,
          expectedVersion: index.version,
          turnId: validated.turnId,
          message: `Patch baseVersion ${validated.baseVersion} is stale. Read version ${index.version} and curate the turn again.`,
        };
      }

      if (
        !index.pendingWrites.some(
          (pending) => pending.patch.turnId === validated.turnId,
        )
      ) {
        index.pendingWrites.push({
          patch: structuredClone(validated),
          journalSequence: this.allocateJournalSequence(index),
          attempts: 0,
          queuedAt: toIso(this.now),
          lastError: "Write-ahead intent has not been attempted yet.",
        });
        index.revision += 1;
        await this.indexes.put(index);
      }

      const results = await this.drainJournal(validated.scope, {
        type: "write",
        turnId: validated.turnId,
      });
      const ownResult = results.writes.find(
        (result) => result.turnId === validated.turnId,
      );
      if (ownResult) return ownResult;

      const current =
        (await this.indexes.get(validated.scope)) ??
        createEmptyMemoryScopeIndex(validated.scope);
      return {
        status: "queued",
        scope: validated.scope,
        version: current.version,
        turnId: validated.turnId,
        message: `Turn ${validated.turnId} is durably queued behind an earlier pending memory write.`,
      };
    });
  }

  private async applyPendingPatch(
    index: MemoryScopeIndex,
    patch: MemoryPatch,
  ): Promise<ApplyPatchResult> {
    const appliedVersion = index.appliedTurns[patch.turnId];
    if (appliedVersion !== undefined) {
      index.pendingWrites = index.pendingWrites.filter(
        (pending) => pending.patch.turnId !== patch.turnId,
      );
      index.revision += 1;
      await this.indexes.put(index);
      return {
        status: "duplicate",
        scope: patch.scope,
        version: appliedVersion,
        turnId: patch.turnId,
        message: `Turn ${patch.turnId} was already consolidated at memory version ${appliedVersion}.`,
      };
    }
    const nextVersion = index.version + 1;
    try {
      await this.preflightPatch(index, patch);
      for (const [operationIndex, operation] of patch.operations.entries()) {
        await this.applyOperation(
          index,
          patch,
          operation,
          operationIndex,
          nextVersion,
        );
      }
      index.version = nextVersion;
      index.appliedTurns[patch.turnId] = nextVersion;
      const turnEntries = Object.entries(index.appliedTurns);
      if (turnEntries.length > this.maxAppliedTurns) {
        index.appliedTurns = Object.fromEntries(
          turnEntries.slice(turnEntries.length - this.maxAppliedTurns),
        );
      }
      index.deltas.push({
        version: nextVersion,
        epoch: index.epoch,
        turnId: patch.turnId,
        changedBlockLabels: changedLabels(patch.operations),
        summary: operationSummary(patch.operations),
        createdAt: toIso(this.now),
      });
      index.deltas = index.deltas.slice(-this.maxDeltas);
      index.pendingWrites = index.pendingWrites.filter(
        (pending) => pending.patch.turnId !== patch.turnId,
      );
      index.revision += 1;
      await this.indexes.put(index);
      return {
        status: "applied",
        scope: patch.scope,
        version: nextVersion,
        turnId: patch.turnId,
        message: `Applied ${patch.operations.length} memory operation(s) at version ${nextVersion}.`,
      };
    } catch (error) {
      const existing = index.pendingWrites.find(
        (pending) => pending.patch.turnId === patch.turnId,
      );
      if (error instanceof MemoryError && !error.retryable) {
        index.pendingWrites = index.pendingWrites.filter(
          (pending) => pending.patch.turnId !== patch.turnId,
        );
        index.revision += 1;
        await this.indexes.put(index);
        throw error;
      }
      if (existing) {
        existing.attempts += 1;
        existing.lastError = errorMessage(error);
      } else {
        index.pendingWrites.push({
          patch: structuredClone(patch),
          journalSequence: this.allocateJournalSequence(index),
          attempts: 1,
          queuedAt: toIso(this.now),
          lastError: errorMessage(error),
        });
      }
      index.revision += 1;
      await this.indexes.put(index);
      return {
        status: "queued",
        scope: patch.scope,
        version: index.version,
        turnId: patch.turnId,
        message: `Letta write failed and was queued for retry: ${errorMessage(error)}`,
      };
    }
  }

  private async preflightPatch(
    index: MemoryScopeIndex,
    patch: MemoryPatch,
  ): Promise<void> {
    const corrected = new Set(
      index.corrections.map((correction) => correction.originalId),
    );
    for (const operation of patch.operations) {
      if (operation.type !== "correct_passage") continue;
      if (corrected.has(operation.memoryId)) {
        throw new MemoryError(
          `Archival memory ${operation.memoryId} is already superseded; correct its replacement instead.`,
          "CONFLICT",
          false,
        );
      }
      if (!(await this.findManagedPassage(index, operation.memoryId))) {
        throw new MemoryError(
          `Archival memory ${operation.memoryId} was not found in ${memoryScopeKey(patch.scope)}.`,
          "NOT_FOUND",
          false,
        );
      }
      corrected.add(operation.memoryId);
    }
  }

  private async drainJournal(
    scope: MemoryScope,
    requested?:
      | { type: "write"; turnId: string }
      | { type: "forget"; turnId: string },
  ): Promise<{
    writes: ApplyPatchResult[];
    forgets: Array<{ turnId: string; result: ForgetResult }>;
  }> {
    const writes: ApplyPatchResult[] = [];
    const forgets: Array<{ turnId: string; result: ForgetResult }> = [];
    while (true) {
      const index = await this.indexes.get(scope);
      if (!index) return { writes, forgets };
      await this.ensureIndexSource(index);
      if (this.normalizeJournal(index)) {
        index.revision += 1;
        await this.indexes.put(index);
      }
      const write = index.pendingWrites.reduce<
        MemoryScopeIndex["pendingWrites"][number] | undefined
      >(
        (current, candidate) =>
          !current ||
          (candidate.journalSequence ?? Number.MAX_SAFE_INTEGER) <
            (current.journalSequence ?? Number.MAX_SAFE_INTEGER)
            ? candidate
            : current,
        undefined,
      );
      const forget = index.pendingForgets.reduce<
        MemoryScopeIndex["pendingForgets"][number] | undefined
      >(
        (current, candidate) =>
          !current ||
          (candidate.journalSequence ?? Number.MAX_SAFE_INTEGER) <
            (current.journalSequence ?? Number.MAX_SAFE_INTEGER)
            ? candidate
            : current,
        undefined,
      );
      if (!write && !forget) return { writes, forgets };
      const writeFirst =
        write !== undefined &&
        (forget === undefined ||
          (write.journalSequence ?? Number.MAX_SAFE_INTEGER) <
            (forget.journalSequence ?? Number.MAX_SAFE_INTEGER));
      if (writeFirst && write) {
        const rebased = {
          ...structuredClone(write.patch),
          baseVersion: index.version,
        };
        try {
          const result = await this.applyPendingPatch(index, rebased);
          writes.push(result);
          if (result.status === "queued") return { writes, forgets };
        } catch (error) {
          if (
            requested?.type === "write" &&
            write.patch.turnId === requested.turnId
          ) {
            throw error;
          }
        }
        continue;
      }
      if (forget) {
        const result = await this.forgetInternal(forget.request, true);
        forgets.push({ turnId: forget.request.turnId, result });
        if (result.status === "queued") return { writes, forgets };
      }
    }
  }

  private async applyOperation(
    index: MemoryScopeIndex,
    patch: MemoryPatch,
    operation: MemoryPatchOperation,
    operationIndex: number,
    nextVersion: number,
  ): Promise<void> {
    switch (operation.type) {
      case "upsert_block": {
        const metadata = blockMetadata(
          patch.scope,
          nextVersion,
          patch.provenance,
        );
        const idempotencyTag = mutationTag(patch.turnId, operationIndex);
        const tags = [BLOCK_TAG, scopeTag(patch.scope), idempotencyTag];
        const blockId = index.blockIds[operation.label];
        const input = {
          label: operation.label,
          value: operation.value,
          description: operation.description,
          limit: operation.limit,
          metadata,
          tags,
        };
        let record: LettaBlockRecord | undefined;
        if (blockId) {
          try {
            record = await this.api.updateBlock(blockId, input);
          } catch (error) {
            if (!isNotFoundError(error)) throw error;
          }
        }
        if (!record) {
          const reconciled = (
            await this.api.listBlocks({
              tags,
              matchAllTags: true,
            })
          ).find((block) => block.label === operation.label);
          record = reconciled
            ? await this.api.updateBlock(reconciled.id, input)
            : await this.api.createBlock({
                label: operation.label,
                value: operation.value,
                description: operation.description,
                limit: operation.limit,
                metadata,
                tags,
              });
        }
        index.blockIds[operation.label] = record.id;
        index.revision += 1;
        await this.indexes.put(index);
        return;
      }
      case "insert_passage": {
        await this.ensurePassage(index, patch, operationIndex, {
          content: operation.content,
          tags: operation.tags,
        });
        return;
      }
      case "correct_passage": {
        const replacement = await this.ensurePassage(
          index,
          patch,
          operationIndex,
          {
            content: operation.replacement,
            tags: [
              ...(operation.tags ?? []),
              `convera_correction_${stableHash(operation.memoryId)}`,
            ],
          },
        );
        const existing = index.corrections.find(
          (correction) =>
            correction.originalId === operation.memoryId &&
            correction.replacementId === replacement.id,
        );
        if (!existing) {
          index.corrections.push({
            originalId: operation.memoryId,
            replacementId: replacement.id,
            reason: operation.reason,
            provenance: patch.provenance,
          });
        }
        return;
      }
      case "set_checkpoint":
        index.checkpoint = operation.value;
        return;
      case "increment_epoch":
        index.epoch += 1;
        index.deltas = [];
        return;
    }
  }

  private requireAgentId(index: MemoryScopeIndex): string {
    if (!index.agentId) {
      throw new MemoryError(
        `No Letta archival container agent is mapped for ${memoryScopeKey(index.scope)}. Provision and persist an agentId before writing archival memory.`,
        "CONFIGURATION",
        false,
      );
    }
    return index.agentId;
  }

  private async ensurePassage(
    index: MemoryScopeIndex,
    patch: MemoryPatch,
    operationIndex: number,
    input: { content: string; tags?: string[] },
  ): Promise<LettaPassageRecord> {
    const idempotencyTag = mutationTag(patch.turnId, operationIndex);
    const archiveId = await this.ensureArchive(index);
    const passages = await this.api.searchArchivePassages(archiveId, {
      tags: [idempotencyTag],
      maxResults: 10,
    });
    const existing = passages.find((passage) =>
      passage.tags.includes(idempotencyTag),
    );
    if (existing) return existing;
    return this.api.createArchivePassage(archiveId, {
      content: input.content,
      createdAt: patch.provenance.timestamp,
      tags: [
        PASSAGE_TAG,
        scopeTag(patch.scope),
        idempotencyTag,
        `convera_turn_${stableHash(patch.turnId)}`,
        ...(input.tags ?? []),
      ],
    });
  }

  private async ensureArchive(index: MemoryScopeIndex): Promise<string> {
    if (index.archiveId) return index.archiveId;
    const key = memoryScopeKey(index.scope);
    const name = `convera_${index.scope.kind}_${stableHash(index.scope.id)}`;
    const description = `Convera-managed archival memory for ${key}.`;
    const archive =
      (await this.api.listArchives({ name })).find(
        (candidate) =>
          candidate.name === name && candidate.description === description,
      ) ??
      (await this.api.createArchive({
        name,
        description,
      }));
    index.archiveId = archive.id;
    index.revision += 1;
    await this.indexes.put(index);
    return archive.id;
  }

  private async findManagedPassage(
    index: MemoryScopeIndex,
    memoryId: string,
  ): Promise<LettaPassageRecord | undefined> {
    const passages = index.archiveId
      ? await this.api.searchArchivePassages(index.archiveId, {
          tags: [PASSAGE_TAG, scopeTag(index.scope)],
          maxResults: 1_000,
        })
      : index.agentId
        ? await this.api.listPassages(index.agentId)
        : [];
    const requiredScopeTag = scopeTag(index.scope);
    return passages.find(
      (passage) =>
        passage.id === memoryId &&
        passage.tags.includes(PASSAGE_TAG) &&
        passage.tags.includes(requiredScopeTag),
    );
  }

  async forget(request: ForgetRequest): Promise<ForgetResult> {
    if (!request.approved) {
      return {
        status: "approval_required",
        scope: request.scope,
        message:
          "Forgetting persistent memory is destructive and requires explicit user approval.",
      };
    }
    return this.writes.run(async () => {
      let index = await this.indexes.get(request.scope);
      if (!index && request.target.type !== "scope") {
        return {
          status: "not_found",
          scope: request.scope,
          message: `No memory exists for ${memoryScopeKey(request.scope)}.`,
        };
      }
      index ??= createEmptyMemoryScopeIndex(request.scope);
      await this.ensureIndexSource(index);
      if (
        !index.pendingForgets.some(
          (pending) => pending.request.turnId === request.turnId,
        )
      ) {
        index.pendingForgets.push({
          request: structuredClone(request),
          journalSequence: this.allocateJournalSequence(index),
          attempts: 0,
          queuedAt: toIso(this.now),
          lastError: "Write-ahead forget intent has not been attempted yet.",
        });
        index.revision += 1;
        await this.indexes.put(index);
      }
      const results = await this.drainJournal(request.scope, {
        type: "forget",
        turnId: request.turnId,
      });
      return (
        results.forgets.find((result) => result.turnId === request.turnId)
          ?.result ?? {
          status: "queued",
          scope: request.scope,
          message: `Forget ${request.turnId} is durably queued behind an earlier memory operation.`,
        }
      );
    });
  }

  private async forgetInternal(
    request: ForgetRequest,
    queueOnFailure: boolean,
  ): Promise<ForgetResult> {
    const index = await this.indexes.get(request.scope);
    if (!index) {
      return {
        status: "not_found",
        scope: request.scope,
        message: `No memory exists for ${memoryScopeKey(request.scope)}.`,
      };
    }
    await this.ensureIndexSource(index);
    const forgetSequence = index.pendingForgets.find(
      (pending) => pending.request.turnId === request.turnId,
    )?.journalSequence;
    try {
      switch (request.target.type) {
        case "block": {
          const blockId = index.blockIds[request.target.label];
          if (!blockId) {
            index.pendingForgets = index.pendingForgets.filter(
              (pending) => pending.request.turnId !== request.turnId,
            );
            index.revision += 1;
            await this.indexes.put(index);
            return {
              status: "not_found",
              scope: request.scope,
              message: `Block ${request.target.label} does not exist.`,
            };
          }
          await this.deleteBlockIfPresent(blockId);
          await this.onScopeForgotten?.(structuredClone(request.scope));
          delete index.blockIds[request.target.label];
          break;
        }
        case "passage": {
          const memoryId = request.target.memoryId;
          if (index.archiveId) {
            // Each archive is dedicated to exactly one Convera scope. Delete
            // the caller-provided known ID directly so archival size and
            // search pagination cannot make approved forget impossible.
            await this.deleteArchivePassageIfPresent(index.archiveId, memoryId);
          } else {
            if (!(await this.findManagedPassage(index, memoryId))) {
              index.pendingForgets = index.pendingForgets.filter(
                (pending) => pending.request.turnId !== request.turnId,
              );
              index.revision += 1;
              await this.indexes.put(index);
              return {
                status: "not_found",
                scope: request.scope,
                message: `Archival memory ${memoryId} does not exist in ${memoryScopeKey(request.scope)}.`,
              };
            }
            const agentId = this.requireAgentId(index);
            await this.deletePassageIfPresent(agentId, memoryId);
          }
          index.corrections = index.corrections.filter(
            (correction) =>
              correction.originalId !== memoryId &&
              correction.replacementId !== memoryId,
          );
          await this.onScopeForgotten?.(structuredClone(request.scope));
          break;
        }
        case "scope": {
          await this.deleteManagedScopeObjects(index);
          // Rotate hidden native/curator sessions before clearing the durable
          // intent. If this hook fails or the process exits, replay repeats
          // the idempotent remote deletes and callback.
          await this.onScopeForgotten?.(structuredClone(request.scope));
          index.version += 1;
          index.epoch += 1;
          index.revision += 1;
          index.blockIds = {};
          delete index.agentId;
          delete index.archiveId;
          delete index.checkpoint;
          delete index.lastKnownGood;
          index.appliedTurns = {};
          index.corrections = [];
          index.deltas = [];
          index.pendingWrites = index.pendingWrites.filter(
            (pending) =>
              (pending.journalSequence ?? Number.MAX_SAFE_INTEGER) >
              (forgetSequence ?? Number.MAX_SAFE_INTEGER),
          );
          index.pendingForgets = index.pendingForgets.filter(
            (pending) =>
              (pending.journalSequence ?? Number.MAX_SAFE_INTEGER) >
              (forgetSequence ?? Number.MAX_SAFE_INTEGER),
          );
          await this.indexes.put(index);
          return {
            status: "forgotten",
            scope: request.scope,
            message: `Forgot all Convera-managed memory for ${memoryScopeKey(request.scope)}. The empty tombstone is at version ${index.version}, epoch ${index.epoch}, so native sessions must reset before continuing.`,
          };
        }
      }
      index.version += 1;
      index.epoch += 1;
      index.lastKnownGood = undefined;
      index.pendingForgets = index.pendingForgets.filter(
        (pending) => pending.request.turnId !== request.turnId,
      );
      index.revision += 1;
      await this.indexes.put(index);
      return {
        status: "forgotten",
        scope: request.scope,
        message: `Persistent memory was removed. Memory epoch is now ${index.epoch}.`,
      };
    } catch (error) {
      if (!queueOnFailure) throw error;
      const existing = index.pendingForgets.find(
        (pending) => pending.request.turnId === request.turnId,
      );
      if (existing) {
        existing.attempts += 1;
        existing.lastError = errorMessage(error);
      } else {
        index.pendingForgets.push({
          request: structuredClone(request),
          journalSequence: this.allocateJournalSequence(index),
          attempts: 1,
          queuedAt: toIso(this.now),
          lastError: errorMessage(error),
        });
      }
      index.revision += 1;
      await this.indexes.put(index);
      return {
        status: "queued",
        scope: request.scope,
        message: `Approved forget operation was queued for retry: ${errorMessage(error)}`,
      };
    }
  }

  private async deleteBlockIfPresent(blockId: string): Promise<void> {
    try {
      await this.api.deleteBlock(blockId);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  private async deleteManagedScopeObjects(
    index: MemoryScopeIndex,
  ): Promise<void> {
    const discoveredBlocks = await this.api.listBlocks({
      tags: [BLOCK_TAG, scopeTag(index.scope)],
      matchAllTags: true,
    });
    const blockIds = new Set([
      ...Object.values(index.blockIds),
      ...discoveredBlocks.map((block) => block.id),
    ]);
    for (const blockId of blockIds) {
      await this.deleteBlockIfPresent(blockId);
    }

    const key = memoryScopeKey(index.scope);
    const archiveName = `convera_${index.scope.kind}_${stableHash(index.scope.id)}`;
    const archiveDescription = `Convera-managed archival memory for ${key}.`;
    const discoveredArchives = await this.api.listArchives({
      name: archiveName,
    });
    const archiveIds = new Set([
      ...(index.archiveId ? [index.archiveId] : []),
      ...discoveredArchives
        .filter(
          (archive) =>
            archive.name === archiveName &&
            archive.description === archiveDescription,
        )
        .map((archive) => archive.id),
    ]);
    for (const archiveId of archiveIds) {
      await this.deleteArchiveIfPresent(archiveId);
    }

    if (index.agentId) {
      const passages = await this.api.listPassages(index.agentId);
      for (const passage of passages) {
        if (
          passage.tags.includes(PASSAGE_TAG) &&
          passage.tags.includes(scopeTag(index.scope))
        ) {
          await this.deletePassageIfPresent(index.agentId, passage.id);
        }
      }
    }
  }

  private async deletePassageIfPresent(
    agentId: string,
    passageId: string,
  ): Promise<void> {
    try {
      await this.api.deletePassage(agentId, passageId);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  private async deleteArchivePassageIfPresent(
    archiveId: string,
    passageId: string,
  ): Promise<void> {
    try {
      await this.api.deleteArchivePassage(archiveId, passageId);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  private async deleteArchiveIfPresent(archiveId: string): Promise<void> {
    try {
      await this.api.deleteArchive(archiveId);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  async flushPending(scope?: MemoryScope): Promise<ApplyPatchResult[]> {
    return this.writes.run(async () => {
      const indexes = scope
        ? [await this.indexes.get(scope)].filter(
            (value): value is MemoryScopeIndex => value !== undefined,
          )
        : await this.indexes.list();
      const results: ApplyPatchResult[] = [];
      for (const initial of indexes) {
        results.push(...(await this.drainJournal(initial.scope)).writes);
      }
      return results;
    });
  }

  /**
   * Replays crash-persisted write intents and approved forget requests.
   * Safe to call on every runtime creation or provider reconnect.
   */
  async initialize(): Promise<ApplyPatchResult[]> {
    return this.flushPending();
  }

  async getStatus(): Promise<MemoryStoreStatus> {
    const [health, indexes] = await Promise.all([
      this.health(),
      this.indexes.list(),
    ]);
    return {
      health,
      scopes: indexes.map((index) => ({
        scope: index.scope,
        version: index.version,
        epoch: index.epoch,
        pendingWrites: index.pendingWrites.length + index.pendingForgets.length,
        cached: index.lastKnownGood !== undefined,
      })),
    };
  }

  async mapArchivalAgent(scope: MemoryScope, agentId: string): Promise<void> {
    await this.writes.run(async () => {
      const index =
        (await this.indexes.get(scope)) ?? createEmptyMemoryScopeIndex(scope);
      await this.ensureIndexSource(index);
      index.agentId = agentId;
      index.revision += 1;
      await this.indexes.put(index);
    });
  }

  async discoverBlocks(scope: MemoryScope): Promise<number> {
    return this.writes.run(async () => {
      const index =
        (await this.indexes.get(scope)) ?? createEmptyMemoryScopeIndex(scope);
      await this.ensureIndexSource(index);
      const records = await this.api.listBlocks({
        tags: [BLOCK_TAG, scopeTag(scope)],
        matchAllTags: true,
      });
      for (const record of records) {
        if (record.label) index.blockIds[record.label] = record.id;
      }
      index.revision += 1;
      await this.indexes.put(index);
      return records.length;
    });
  }

  async assertScope(scope: MemoryScope): Promise<void> {
    const index = await this.indexes.get(scope);
    if (index && !sameMemoryScope(index.scope, scope)) {
      throw new MemoryError(
        `Memory index scope mismatch for ${memoryScopeKey(scope)}.`,
        "VALIDATION",
        false,
      );
    }
  }
}
