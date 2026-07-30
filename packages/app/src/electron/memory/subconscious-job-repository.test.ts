import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  InMemorySubconsciousJobRepository,
  JsonSubconsciousJobRepository,
  type PersistedSubconsciousJob,
  type SubconsciousJobRepository,
} from "./subconscious-job-repository";
import type { SubconsciousJobState } from "./subconscious-worker";

const scope = { kind: "conversation" as const, id: "conversation-1" };

function job(
  id: string,
  status: SubconsciousJobState["status"],
  minute: number,
): PersistedSubconsciousJob {
  const timestamp = new Date(Date.UTC(2026, 6, 31, 0, minute)).toISOString();
  return {
    state: {
      id,
      turnIds: [`turn-${id}`],
      scope,
      status,
      attempts: status === "queued" ? 0 : 1,
      error: status === "failed" ? "Keep this failure visible." : undefined,
    },
    turn: {
      turnId: `turn-${id}`,
      conversationId: scope.id,
      scope,
      userContent: "user",
      assistantContent: "assistant",
      completedAt: timestamp,
      providerId: "codex-cli",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function seedAndAssertRetention(
  repository: SubconsciousJobRepository,
): Promise<void> {
  await repository.put(job("old-completed", "completed", 1));
  await repository.put(job("queued", "queued", 0));
  await repository.put(job("failed", "failed", 0));
  await repository.put(job("running", "running", 0));
  await repository.put(job("new-skipped", "skipped", 2));
  await repository.put(job("new-completed", "completed", 3));

  assertRetention(await repository.list());
}

function assertRetention(jobs: PersistedSubconsciousJob[]): void {
  expect(jobs.map((value) => value.state.id).sort()).toEqual([
    "new-completed",
    "new-skipped",
    "queued",
    "running",
  ]);
  expect(
    jobs.filter((value) =>
      ["completed", "skipped", "failed"].includes(value.state.status),
    ),
  ).toHaveLength(2);
  expect(jobs.some((value) => value.state.id === "failed")).toBe(false);
}

describe("SubconsciousJobRepository retention", () => {
  it("prunes the oldest completed, skipped, or failed jobs in memory", async () => {
    const repository = new InMemorySubconsciousJobRepository([], {
      maxTerminalJobs: 2,
    });

    await seedAndAssertRetention(repository);
  });

  it("persists bounded terminal history without pruning pending jobs", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "convera-memory-job-retention-"),
    );
    const filePath = path.join(directory, "jobs.json");
    try {
      const repository = new JsonSubconsciousJobRepository({
        path: filePath,
        maxTerminalJobs: 2,
      });
      await seedAndAssertRetention(repository);

      const reopened = new JsonSubconsciousJobRepository({
        path: filePath,
        maxTerminalJobs: 2,
      });
      assertRetention(await reopened.list());
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("validates configurable retention limits", () => {
    expect(
      () =>
        new InMemorySubconsciousJobRepository([], {
          maxTerminalJobs: -1,
        }),
    ).toThrow("non-negative integer");
    expect(
      () =>
        new JsonSubconsciousJobRepository({
          path: "/unused/jobs.json",
          maxTerminalJobs: 1.5,
        }),
    ).toThrow("non-negative integer");
  });
});
