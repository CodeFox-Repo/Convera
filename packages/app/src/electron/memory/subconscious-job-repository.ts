import type {
  CompletedMemoryTurn,
  SubconsciousJobState,
} from "./subconscious-worker";
import { AtomicJsonFile } from "./json-file";
import { SerialTaskQueue } from "./serial-queue";
import { memoryScopeSchema, sameMemoryScope, type MemoryScope } from "./types";
import { z } from "zod";

export interface PersistedSubconsciousJob {
  state: SubconsciousJobState;
  turn: CompletedMemoryTurn;
  createdAt: string;
  updatedAt: string;
}

export interface SubconsciousJobRepository {
  list(): Promise<PersistedSubconsciousJob[]>;
  put(job: PersistedSubconsciousJob): Promise<void>;
  deleteByScope(scope: MemoryScope): Promise<void>;
}

export class InMemorySubconsciousJobRepository
  implements SubconsciousJobRepository
{
  private readonly jobs = new Map<string, PersistedSubconsciousJob>();

  constructor(initial: PersistedSubconsciousJob[] = []) {
    for (const job of initial) {
      this.jobs.set(job.state.id, structuredClone(job));
    }
  }

  async list(): Promise<PersistedSubconsciousJob[]> {
    return [...this.jobs.values()].map((job) => structuredClone(job));
  }

  async put(job: PersistedSubconsciousJob): Promise<void> {
    this.jobs.set(job.state.id, structuredClone(job));
  }

  async deleteByScope(scope: MemoryScope): Promise<void> {
    for (const [id, job] of this.jobs) {
      if (sameMemoryScope(job.state.scope, scope)) this.jobs.delete(id);
    }
  }
}

const persistedJobSchema = z.object({
  state: z.object({
    id: z.string().min(1),
    turnIds: z.array(z.string().min(1)).min(1),
    scope: memoryScopeSchema,
    status: z.enum(["queued", "running", "completed", "failed", "skipped"]),
    attempts: z.number().int().min(0),
    error: z.string().optional(),
    reason: z.string().optional(),
    result: z
      .object({
        status: z.enum(["applied", "duplicate", "conflict", "queued"]),
        scope: memoryScopeSchema,
        version: z.number().int().min(0),
        expectedVersion: z.number().int().min(0).optional(),
        turnId: z.string().min(1),
        message: z.string(),
      })
      .optional(),
  }),
  turn: z.object({
    turnId: z.string().min(1),
    conversationId: z.string().min(1).optional(),
    candidateTurnId: z.string().min(1).optional(),
    scope: memoryScopeSchema,
    userContent: z.string(),
    assistantContent: z.string(),
    completedAt: z.string().datetime(),
    providerId: z.string().optional(),
    candidates: z.array(z.unknown()).optional(),
    eligibleForMemory: z.boolean().optional(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const persistedJobsSchema = z.object({
  schemaVersion: z.literal(1),
  jobs: z.array(persistedJobSchema),
});

export class JsonSubconsciousJobRepository
  implements SubconsciousJobRepository
{
  private readonly file: AtomicJsonFile;
  private readonly writes = new SerialTaskQueue();

  constructor(options: { path: string }) {
    this.file = new AtomicJsonFile(options.path);
  }

  private async readState(): Promise<{
    schemaVersion: 1;
    jobs: PersistedSubconsciousJob[];
  }> {
    const value = await this.file.read();
    if (value === undefined) return { schemaVersion: 1, jobs: [] };
    return persistedJobsSchema.parse(value) as {
      schemaVersion: 1;
      jobs: PersistedSubconsciousJob[];
    };
  }

  async list(): Promise<PersistedSubconsciousJob[]> {
    return structuredClone((await this.readState()).jobs);
  }

  async put(job: PersistedSubconsciousJob): Promise<void> {
    await this.writes.run(async () => {
      const validated = persistedJobSchema.parse(
        job,
      ) as PersistedSubconsciousJob;
      const state = await this.readState();
      const existing = state.jobs.findIndex(
        (candidate) => candidate.state.id === validated.state.id,
      );
      if (existing === -1) state.jobs.push(structuredClone(validated));
      else state.jobs[existing] = structuredClone(validated);
      await this.file.write(state);
    });
  }

  async deleteByScope(scope: MemoryScope): Promise<void> {
    await this.writes.run(async () => {
      const state = await this.readState();
      const jobs = state.jobs.filter(
        (job) => !sameMemoryScope(job.state.scope, scope),
      );
      if (jobs.length === state.jobs.length) return;
      state.jobs = jobs;
      await this.file.write(state);
    });
  }
}
