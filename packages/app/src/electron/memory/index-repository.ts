import type {
  ForgetRequest,
  MemoryDelta,
  MemoryPatch,
  MemoryProvenance,
  MemoryScope,
  MemorySnapshot,
} from "./types";
import {
  memoryPatchSchema,
  memoryProvenanceSchema,
  memoryScopeKey,
  memoryScopeSchema,
} from "./types";
import { z } from "zod";
import { AtomicJsonFile } from "./json-file";
import { SerialTaskQueue } from "./serial-queue";

export interface MemoryCorrectionIndex {
  originalId: string;
  replacementId: string;
  reason: string;
  provenance: MemoryProvenance;
}

export interface PendingMemoryWrite {
  patch: MemoryPatch;
  attempts: number;
  queuedAt: string;
  lastError: string;
}

export interface PendingMemoryForget {
  request: ForgetRequest;
  attempts: number;
  queuedAt: string;
  lastError: string;
}

export interface MemoryScopeIndex {
  scope: MemoryScope;
  revision: number;
  version: number;
  epoch: number;
  blockIds: Record<string, string>;
  agentId?: string;
  archiveId?: string;
  checkpoint?: string;
  appliedTurns: Record<string, number>;
  corrections: MemoryCorrectionIndex[];
  deltas: MemoryDelta[];
  lastKnownGood?: MemorySnapshot;
  pendingWrites: PendingMemoryWrite[];
  pendingForgets: PendingMemoryForget[];
}

export interface MemoryIndexRepository {
  get(scope: MemoryScope): Promise<MemoryScopeIndex | undefined>;
  put(index: MemoryScopeIndex): Promise<void>;
  delete(scope: MemoryScope): Promise<void>;
  list(): Promise<MemoryScopeIndex[]>;
}

export function createEmptyMemoryScopeIndex(
  scope: MemoryScope,
): MemoryScopeIndex {
  return {
    scope,
    revision: 0,
    version: 0,
    epoch: 0,
    blockIds: {},
    appliedTurns: {},
    corrections: [],
    deltas: [],
    pendingWrites: [],
    pendingForgets: [],
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryMemoryIndexRepository implements MemoryIndexRepository {
  private readonly indexes = new Map<string, MemoryScopeIndex>();

  constructor(initial: MemoryScopeIndex[] = []) {
    for (const index of initial) {
      this.indexes.set(memoryScopeKey(index.scope), clone(index));
    }
  }

  async get(scope: MemoryScope): Promise<MemoryScopeIndex | undefined> {
    const value = this.indexes.get(memoryScopeKey(scope));
    return value ? clone(value) : undefined;
  }

  async put(index: MemoryScopeIndex): Promise<void> {
    this.indexes.set(memoryScopeKey(index.scope), clone(index));
  }

  async delete(scope: MemoryScope): Promise<void> {
    this.indexes.delete(memoryScopeKey(scope));
  }

  async list(): Promise<MemoryScopeIndex[]> {
    return [...this.indexes.values()].map(clone);
  }
}

const persistedScopeIndexSchema = z.object({
  scope: memoryScopeSchema,
  revision: z.number().int().min(0),
  version: z.number().int().min(0),
  epoch: z.number().int().min(0),
  blockIds: z.record(z.string(), z.string()),
  agentId: z.string().min(1).optional(),
  archiveId: z.string().min(1).optional(),
  checkpoint: z.string().optional(),
  appliedTurns: z.record(z.string(), z.number().int().min(0)),
  corrections: z.array(
    z.object({
      originalId: z.string().min(1),
      replacementId: z.string().min(1),
      reason: z.string(),
      provenance: memoryProvenanceSchema,
    }),
  ),
  deltas: z.array(
    z.object({
      version: z.number().int().min(0),
      epoch: z.number().int().min(0),
      turnId: z.string().min(1),
      changedBlockLabels: z.array(z.string()),
      summary: z.string(),
      createdAt: z.string().datetime(),
    }),
  ),
  lastKnownGood: z
    .object({
      scope: memoryScopeSchema,
      version: z.number().int().min(0),
      epoch: z.number().int().min(0),
      blocks: z.array(z.unknown()),
      deltas: z.array(z.unknown()),
      checkpoint: z.string().optional(),
      retrievedAt: z.string().datetime(),
      stale: z.boolean(),
      pendingTurnIds: z.array(z.string()),
    })
    .optional(),
  pendingWrites: z.array(
    z.object({
      patch: memoryPatchSchema,
      attempts: z.number().int().min(0),
      queuedAt: z.string().datetime(),
      lastError: z.string(),
    }),
  ),
  pendingForgets: z.array(
    z.object({
      request: z.object({
        scope: memoryScopeSchema,
        target: z.discriminatedUnion("type", [
          z.object({ type: z.literal("block"), label: z.string().min(1) }),
          z.object({
            type: z.literal("passage"),
            memoryId: z.string().min(1),
          }),
          z.object({ type: z.literal("scope") }),
        ]),
        reason: z.string().min(1),
        turnId: z.string().min(1),
        approved: z.boolean(),
      }),
      attempts: z.number().int().min(0),
      queuedAt: z.string().datetime(),
      lastError: z.string(),
    }),
  ),
});

const persistedIndexesSchema = z.object({
  schemaVersion: z.literal(1),
  indexes: z.array(persistedScopeIndexSchema),
});

export class JsonMemoryIndexRepository implements MemoryIndexRepository {
  private readonly file: AtomicJsonFile;
  private readonly writes = new SerialTaskQueue();

  constructor(options: { path: string }) {
    this.file = new AtomicJsonFile(options.path);
  }

  private async readState(): Promise<{
    schemaVersion: 1;
    indexes: MemoryScopeIndex[];
  }> {
    const value = await this.file.read();
    if (value === undefined) return { schemaVersion: 1, indexes: [] };
    return persistedIndexesSchema.parse(value) as {
      schemaVersion: 1;
      indexes: MemoryScopeIndex[];
    };
  }

  async get(scope: MemoryScope): Promise<MemoryScopeIndex | undefined> {
    const index = (await this.readState()).indexes.find(
      (candidate) => memoryScopeKey(candidate.scope) === memoryScopeKey(scope),
    );
    return index ? clone(index) : undefined;
  }

  async put(index: MemoryScopeIndex): Promise<void> {
    await this.writes.run(async () => {
      const validated = persistedScopeIndexSchema.parse(
        index,
      ) as MemoryScopeIndex;
      const state = await this.readState();
      const key = memoryScopeKey(validated.scope);
      const existing = state.indexes.findIndex(
        (candidate) => memoryScopeKey(candidate.scope) === key,
      );
      if (existing === -1) state.indexes.push(clone(validated));
      else state.indexes[existing] = clone(validated);
      await this.file.write(state);
    });
  }

  async delete(scope: MemoryScope): Promise<void> {
    await this.writes.run(async () => {
      const state = await this.readState();
      const key = memoryScopeKey(scope);
      state.indexes = state.indexes.filter(
        (candidate) => memoryScopeKey(candidate.scope) !== key,
      );
      await this.file.write(state);
    });
  }

  async list(): Promise<MemoryScopeIndex[]> {
    return clone((await this.readState()).indexes);
  }
}
