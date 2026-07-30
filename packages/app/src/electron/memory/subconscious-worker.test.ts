import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createEmptyMemoryScopeIndex,
  InMemoryMemoryIndexRepository,
} from "./index-repository";
import { LettaMemoryStore } from "./store";
import {
  InMemorySubconsciousJobRepository,
  JsonSubconsciousJobRepository,
  type PersistedSubconsciousJob,
} from "./subconscious-job-repository";
import {
  SubconsciousWorker,
  type CompletedMemoryTurn,
  type CuratorInput,
  type RestrictedMemoryCurator,
} from "./subconscious-worker";
import { FakeLettaApi } from "./testing/fake-letta-api";

const scope = { kind: "conversation" as const, id: "conversation-1" };
const timestamp = "2026-07-31T00:00:00.000Z";

function turn(id: string): CompletedMemoryTurn {
  return {
    turnId: id,
    scope,
    userContent: "Remember the selected architecture.",
    assistantContent: "Letta stores memory and native sessions store history.",
    completedAt: timestamp,
  };
}

function setup() {
  const store = new LettaMemoryStore({
    api: new FakeLettaApi(),
    indexRepository: new InMemoryMemoryIndexRepository([
      createEmptyMemoryScopeIndex(scope),
    ]),
    now: () => new Date(timestamp),
  });
  return store;
}

function patchFor(input: CuratorInput) {
  return {
    scope: input.scope,
    baseVersion: input.baseVersion,
    turnId: input.expectedPatchTurnId,
    provenance: {
      actor: "subconscious" as const,
      turnId: input.expectedPatchTurnId,
      timestamp,
    },
    operations: [
      {
        type: "upsert_block" as const,
        label: "decisions",
        value: input.turns.map((value) => value.turnId).join(","),
      },
    ],
  };
}

describe("SubconsciousWorker", () => {
  it("batches completed turns into one restricted versioned curator patch", async () => {
    const store = setup();
    const curate = vi.fn(async (input: CuratorInput) => patchFor(input));
    const worker = new SubconsciousWorker({
      store,
      curator: { curate },
      schedule: "batch",
      batchSize: 2,
      retryBaseMs: 0,
      jobRepository: new InMemorySubconsciousJobRepository(),
    });

    await worker.enqueue(turn("turn-1"));
    await worker.enqueue(turn("turn-2"));
    await worker.flush();

    expect(curate).toHaveBeenCalledOnce();
    expect(curate.mock.calls[0]?.[0].allowedCapabilities).toEqual([
      "memory_read",
      "memory_search",
      "memory_apply_patch",
    ]);
    expect((await store.getSnapshot(scope)).version).toBe(1);
    worker.dispose();
  });

  it("retries transient curator failures", async () => {
    const store = setup();
    let attempts = 0;
    const curator: RestrictedMemoryCurator = {
      curate: async (input) => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary provider failure");
        return patchFor(input);
      },
    };
    const worker = new SubconsciousWorker({
      store,
      curator,
      schedule: "batch",
      batchSize: 10,
      maxAttempts: 2,
      retryBaseMs: 0,
      jobRepository: new InMemorySubconsciousJobRepository(),
    });
    const jobId = await worker.enqueue(turn("turn-1"));
    await worker.flush();

    expect(attempts).toBe(2);
    expect(worker.getState(jobId)?.status).toBe("completed");
    worker.dispose();
  });

  it("accepts an explicit curator noop without bumping memory version", async () => {
    const store = setup();
    const worker = new SubconsciousWorker({
      store,
      curator: {
        curate: async () => ({
          action: "noop",
          reason: "The turn contains no durable information.",
        }),
      },
      schedule: "every-turn",
      retryBaseMs: 0,
      jobRepository: new InMemorySubconsciousJobRepository(),
    });
    const jobId = await worker.enqueue(turn("turn-noop"));
    await worker.flush();

    expect(worker.getState(jobId)).toMatchObject({
      status: "skipped",
      reason: "The turn contains no durable information.",
    });
    expect((await store.getSnapshot(scope)).version).toBe(0);
    worker.dispose();
  });

  it("recovers a running job as queued after restart", async () => {
    const persisted: PersistedSubconsciousJob = {
      state: {
        id: "memory-job-7",
        turnIds: ["turn-7"],
        scope,
        status: "running",
        attempts: 1,
      },
      turn: turn("turn-7"),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const jobs = new InMemorySubconsciousJobRepository([persisted]);
    const worker = new SubconsciousWorker({
      store: setup(),
      curator: { curate: async (input) => patchFor(input) },
      schedule: "batch",
      batchSize: 10,
      jobRepository: jobs,
      retryBaseMs: 0,
    });

    await worker.initialize();
    expect(["queued", "running"]).toContain(
      worker.getState("memory-job-7")?.status,
    );
    await worker.flush();

    expect(worker.getState("memory-job-7")?.status).toBe("completed");
    expect((await jobs.list())[0]?.state.status).toBe("completed");
    worker.dispose();
  });

  it("recovers and completes an interrupted job from the atomic JSON repository", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "convera-memory-jobs-"),
    );
    const filePath = path.join(directory, "jobs.json");
    try {
      const firstRepository = new JsonSubconsciousJobRepository({
        path: filePath,
      });
      await firstRepository.put({
        state: {
          id: "memory-job-11",
          turnIds: ["turn-11"],
          scope,
          status: "running",
          attempts: 1,
        },
        turn: turn("turn-11"),
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const worker = new SubconsciousWorker({
        store: setup(),
        curator: { curate: async (input) => patchFor(input) },
        schedule: "batch",
        batchSize: 10,
        retryBaseMs: 0,
        jobRepository: new JsonSubconsciousJobRepository({
          path: filePath,
        }),
      });
      await worker.initialize();
      expect(["queued", "running"]).toContain(
        worker.getState("memory-job-11")?.status,
      );
      await worker.flush();
      worker.dispose();

      const afterRestart = await new JsonSubconsciousJobRepository({
        path: filePath,
      }).list();
      expect(afterRestart[0]?.state).toMatchObject({
        id: "memory-job-11",
        status: "completed",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an unknown job schema without overwriting it", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "convera-memory-jobs-invalid-"),
    );
    const filePath = path.join(directory, "jobs.json");
    const invalid = JSON.stringify({ schemaVersion: 99, jobs: [] });
    try {
      await writeFile(filePath, invalid, "utf8");
      const repository = new JsonSubconsciousJobRepository({
        path: filePath,
      });
      await expect(repository.list()).rejects.toThrow();
      await expect(
        repository.put({
          state: {
            id: "memory-job-1",
            turnIds: ["turn-1"],
            scope,
            status: "queued",
            attempts: 0,
          },
          turn: turn("turn-1"),
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ).rejects.toThrow();
      expect(await readFile(filePath, "utf8")).toBe(invalid);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
