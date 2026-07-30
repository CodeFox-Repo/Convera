import { describe, expect, it } from "vitest";
import { MemoryContextCompiler } from "./context-compiler";
import {
  createEmptyMemoryScopeIndex,
  InMemoryMemoryIndexRepository,
} from "./index-repository";
import { LettaMemoryStore } from "./store";
import { FakeLettaApi } from "./testing/fake-letta-api";
import type { MemoryPatch, MemoryScope } from "./types";

const scope: MemoryScope = { kind: "conversation", id: "conversation-1" };
const now = () => new Date("2026-07-31T00:00:00.000Z");

function patch(overrides: Partial<MemoryPatch> = {}): MemoryPatch {
  const turnId = overrides.turnId ?? "turn-1";
  return {
    scope,
    baseVersion: 0,
    turnId,
    provenance: {
      actor: "subconscious",
      turnId,
      timestamp: now().toISOString(),
    },
    operations: [
      {
        type: "upsert_block",
        label: "current_goal",
        value: "Implement durable memory",
      },
    ],
    ...overrides,
  };
}

function setup() {
  const api = new FakeLettaApi();
  const index = createEmptyMemoryScopeIndex(scope);
  const indexes = new InMemoryMemoryIndexRepository([index]);
  const store = new LettaMemoryStore({
    api,
    indexRepository: indexes,
    now,
  });
  return { api, indexes, store };
}

describe("LettaMemoryStore", () => {
  it("applies versioned patches and treats a repeated turn as idempotent", async () => {
    const { api, store } = setup();
    const first = await store.applyPatch(
      patch({
        operations: [
          {
            type: "upsert_block",
            label: "current_goal",
            value: "Implement durable memory",
          },
          {
            type: "insert_passage",
            content: "The user selected Letta blocks plus native sessions.",
            tags: ["decision"],
          },
        ],
      }),
    );
    const duplicate = await store.applyPatch(patch());

    expect(first.status).toBe("applied");
    expect(first.version).toBe(1);
    expect(duplicate.status).toBe("duplicate");
    expect(api.blocks.size).toBe(1);
    expect(api.archives.size).toBe(1);
    expect([...api.archivePassages.values()][0]?.size).toBe(1);
  });

  it("rejects stale base versions without mutating Letta", async () => {
    const { api, store } = setup();
    await store.applyPatch(patch());
    const result = await store.applyPatch(
      patch({ turnId: "turn-2", baseVersion: 0 }),
    );

    expect(result).toMatchObject({
      status: "conflict",
      version: 1,
      expectedVersion: 1,
    });
    expect(api.blocks.size).toBe(1);
  });

  it("supersedes corrections in search without deleting audit history", async () => {
    const { api, store } = setup();
    await store.applyPatch(
      patch({
        turnId: "turn-original",
        operations: [
          {
            type: "insert_passage",
            content: "The preferred provider is Claude.",
            tags: ["preference"],
          },
        ],
      }),
    );
    const archive = [...api.archives.values()][0];
    const original = archive
      ? [...(api.archivePassages.get(archive.id)?.values() ?? [])][0]
      : undefined;
    if (!archive || !original) throw new Error("missing test passage");
    await store.applyPatch(
      patch({
        turnId: "turn-correction",
        baseVersion: 1,
        operations: [
          {
            type: "correct_passage",
            memoryId: original.id,
            replacement: "The preferred provider is Codex.",
            reason: "The user changed the setting.",
            tags: ["preference"],
          },
        ],
      }),
    );

    const result = await store.search({
      scopes: [scope],
      query: "preferred provider",
    });
    expect(result.hits.map((hit) => hit.content)).toEqual([
      "The preferred provider is Codex.",
    ]);
    expect(api.archivePassages.get(archive.id)?.size).toBe(2);
  });

  it("uses last-known-good snapshot while Letta is offline", async () => {
    const { api, store } = setup();
    await store.applyPatch(patch());
    const fresh = await store.getSnapshot(scope);
    api.available = false;
    const stale = await store.getSnapshot(scope);

    expect(fresh.stale).toBe(false);
    expect(stale.stale).toBe(true);
    expect(stale.blocks[0]?.value).toBe("Implement durable memory");
  });

  it("queues failed writes and flushes them idempotently", async () => {
    const { api, store } = setup();
    api.failWrites = 1;
    const queued = await store.applyPatch(patch());
    const flushed = await store.flushPending(scope);
    const snapshot = await store.getSnapshot(scope);

    expect(queued.status).toBe("queued");
    expect(flushed).toHaveLength(1);
    expect(flushed[0]?.status).toBe("applied");
    expect(snapshot.version).toBe(1);
    expect(snapshot.pendingTurnIds).toEqual([]);
  });

  it("requires approval before destructive forgetting", async () => {
    const { api, store } = setup();
    await store.applyPatch(patch());
    const denied = await store.forget({
      scope,
      target: { type: "block", label: "current_goal" },
      reason: "requested",
      turnId: "forget-1",
      approved: false,
    });
    const approved = await store.forget({
      scope,
      target: { type: "block", label: "current_goal" },
      reason: "requested",
      turnId: "forget-2",
      approved: true,
    });

    expect(denied.status).toBe("approval_required");
    expect(api.blocks.size).toBe(0);
    expect(approved.status).toBe("forgotten");
  });

  it("retains an incremented tombstone epoch after scope forget", async () => {
    const { indexes, store } = setup();
    await store.applyPatch(patch());
    await store.forget({
      scope,
      target: { type: "scope" },
      reason: "The user requested complete memory deletion.",
      turnId: "forget-scope",
      approved: true,
    });

    const tombstone = await indexes.get(scope);
    expect(tombstone).toMatchObject({
      version: 2,
      epoch: 1,
      blockIds: {},
      appliedTurns: {},
      corrections: [],
      pendingWrites: [],
      pendingForgets: [],
    });
    expect(tombstone?.archiveId).toBeUndefined();
    const compiled = new MemoryContextCompiler().compile({
      snapshots: [await store.getSnapshot(scope)],
      session: {
        isNew: false,
        seen: {
          "conversation:conversation-1": { version: 1, epoch: 0 },
        },
      },
      budget: { maxCharacters: 2_000, maxTokens: 500 },
    });
    expect(compiled).toMatchObject({
      mode: "epoch_reset",
      requiresNewSession: true,
    });
  });
});
