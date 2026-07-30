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

  it("rejects corrections outside the managed scope instead of retrying them", async () => {
    const { indexes, store } = setup();
    await expect(
      store.applyPatch(
        patch({
          operations: [
            {
              type: "correct_passage",
              memoryId: "foreign-passage",
              replacement: "Must not be written.",
              reason: "Invalid target.",
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      retryable: false,
    });
    expect((await indexes.get(scope))?.pendingWrites).toEqual([]);
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

  it("retains the previous validated snapshot after a newer write until it can refresh", async () => {
    const { api, store } = setup();
    await store.applyPatch(patch());
    const validated = await store.getSnapshot(scope);
    await store.applyPatch(
      patch({
        turnId: "turn-2",
        baseVersion: 1,
        operations: [
          {
            type: "upsert_block",
            label: "current_goal",
            value: "A newer value that has not been read back",
          },
        ],
      }),
    );
    api.available = false;

    const stale = await store.getSnapshot(scope);

    expect(validated).toMatchObject({
      version: 1,
      stale: false,
    });
    expect(stale).toMatchObject({
      version: 1,
      stale: true,
    });
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

  it("replays older pending intents before newer writes without starving on stale versions", async () => {
    const { api, indexes, store } = setup();
    api.failWrites = 1;
    const queued = await store.applyPatch(
      patch({
        turnId: "offline-turn",
        operations: [
          {
            type: "upsert_block",
            label: "current_goal",
            value: "Preserve the offline turn",
          },
        ],
      }),
    );
    const newer = await store.applyPatch(
      patch({
        turnId: "newer-turn",
        operations: [
          {
            type: "upsert_block",
            label: "current_goal",
            value: "Then apply the newer turn",
          },
        ],
      }),
    );

    expect(queued.status).toBe("queued");
    expect(newer).toMatchObject({ status: "applied", version: 2 });
    expect((await indexes.get(scope))?.pendingWrites).toEqual([]);
    expect(await store.getSnapshot(scope)).toMatchObject({
      version: 2,
      blocks: [expect.objectContaining({ value: "Then apply the newer turn" })],
    });
  });

  it("recovers a persisted write-ahead intent during store initialization", async () => {
    const { api, indexes, store } = setup();
    api.failWrites = 1;
    await expect(store.applyPatch(patch())).resolves.toMatchObject({
      status: "queued",
    });

    const restarted = new LettaMemoryStore({
      api,
      indexRepository: indexes,
      now,
    });
    const recovered = await restarted.initialize();

    expect(recovered).toEqual([
      expect.objectContaining({ status: "applied", turnId: "turn-1" }),
    ]);
    expect((await indexes.get(scope))?.pendingWrites).toEqual([]);
  });

  it("reconciles a block created remotely before its response was lost", async () => {
    const { api, indexes, store } = setup();
    api.failAfterWriteMethods.add("createBlock");

    await expect(store.applyPatch(patch())).resolves.toMatchObject({
      status: "queued",
    });
    expect(api.blocks.size).toBe(1);
    expect((await indexes.get(scope))?.blockIds).toEqual({});

    await store.initialize();

    expect(api.blocks.size).toBe(1);
    expect((await indexes.get(scope))?.blockIds).toEqual({
      current_goal: "block-1",
    });
    expect((await indexes.get(scope))?.pendingWrites).toEqual([]);
  });

  it("reconciles a remote archive and passage across response-loss windows", async () => {
    const archiveSetup = setup();
    archiveSetup.api.failAfterWriteMethods.add("createArchive");
    await archiveSetup.store.applyPatch(
      patch({
        operations: [
          {
            type: "insert_passage",
            content: "Archive creation must be recoverable.",
          },
        ],
      }),
    );
    await archiveSetup.store.initialize();
    expect(archiveSetup.api.archives.size).toBe(1);
    expect([...archiveSetup.api.archivePassages.values()][0]?.size).toBe(1);

    const passageSetup = setup();
    passageSetup.api.failAfterWriteMethods.add("createArchivePassage");
    await passageSetup.store.applyPatch(
      patch({
        operations: [
          {
            type: "insert_passage",
            content: "Passage creation must be idempotent.",
          },
        ],
      }),
    );
    await passageSetup.store.initialize();
    expect(passageSetup.api.archives.size).toBe(1);
    expect([...passageSetup.api.archivePassages.values()][0]?.size).toBe(1);
    expect((await passageSetup.indexes.get(scope))?.pendingWrites).toEqual([]);
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

  it("replays a prewritten forget intent after a remote delete response is lost", async () => {
    const { api, indexes, store } = setup();
    await store.applyPatch(patch());
    api.failAfterWriteMethods.add("deleteBlock");

    const queued = await store.forget({
      scope,
      target: { type: "block", label: "current_goal" },
      reason: "Remove the durable goal.",
      turnId: "forget-response-loss",
      approved: true,
    });
    expect(queued.status).toBe("queued");
    expect(api.blocks.size).toBe(0);
    expect((await indexes.get(scope))?.pendingForgets).toHaveLength(1);

    await store.initialize();

    expect((await indexes.get(scope))?.blockIds).toEqual({});
    expect((await indexes.get(scope))?.pendingForgets).toEqual([]);
  });

  it("forgets a known passage directly from a large dedicated archive", async () => {
    const { api, indexes, store } = setup();
    const archiveId = "archive-large";
    api.archives.set(archiveId, {
      id: archiveId,
      name: "large",
      description: "large dedicated test archive",
    });
    const passages = new Map(
      Array.from({ length: 101 }, (_, index) => {
        const id = `passage-${index + 1}`;
        return [
          id,
          {
            id,
            content: `memory ${index + 1}`,
            tags: ["convera_memory_passage"],
          },
        ];
      }),
    );
    api.archivePassages.set(archiveId, passages);
    const index = (await indexes.get(scope))!;
    index.archiveId = archiveId;
    await indexes.put(index);

    const result = await store.forget({
      scope,
      target: { type: "passage", memoryId: "passage-101" },
      reason: "Delete a known memory beyond the first result page.",
      turnId: "forget-large-archive-passage",
      approved: true,
    });

    expect(result.status).toBe("forgotten");
    expect(api.archivePassages.get(archiveId)?.has("passage-101")).toBe(false);
    expect(api.calls).not.toContain("listArchivePassages");
    expect(api.calls).not.toContain("searchArchivePassages");
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

  it("notifies the runtime before clearing the durable scope-forget intent", async () => {
    const api = new FakeLettaApi();
    const indexes = new InMemoryMemoryIndexRepository([
      createEmptyMemoryScopeIndex(scope),
    ]);
    const observedIndexes: Array<{
      version: number;
      pendingForgets: number;
      blockIds: number;
    }> = [];
    const store = new LettaMemoryStore({
      api,
      indexRepository: indexes,
      now,
      onScopeForgotten: async (forgottenScope) => {
        expect(forgottenScope).toEqual(scope);
        const current = await indexes.get(scope);
        observedIndexes.push({
          version: current?.version ?? -1,
          pendingForgets: current?.pendingForgets.length ?? -1,
          blockIds: Object.keys(current?.blockIds ?? {}).length,
        });
      },
    });
    await store.applyPatch(patch());

    await store.forget({
      scope,
      target: { type: "scope" },
      reason: "Reset the native provider session.",
      turnId: "forget-and-rotate",
      approved: true,
    });

    expect(observedIndexes).toEqual([
      { version: 1, pendingForgets: 1, blockIds: 1 },
    ]);
    expect(await indexes.get(scope)).toMatchObject({
      version: 2,
      pendingForgets: [],
      blockIds: {},
    });
  });

  it("notifies scope forget even when no local memory index exists", async () => {
    const forgotten: MemoryScope[] = [];
    const indexes = new InMemoryMemoryIndexRepository();
    const store = new LettaMemoryStore({
      api: new FakeLettaApi(),
      indexRepository: indexes,
      now,
      onScopeForgotten: (forgottenScope) => {
        forgotten.push(forgottenScope);
      },
    });

    const result = await store.forget({
      scope,
      target: { type: "scope" },
      reason: "Rotate a hidden curator session with no durable memories.",
      turnId: "forget-hidden-session",
      approved: true,
    });

    expect(result.status).toBe("forgotten");
    expect(forgotten).toEqual([scope]);
    expect(await indexes.get(scope)).toMatchObject({
      version: 1,
      epoch: 1,
      pendingForgets: [],
    });
  });

  it("replays scope cleanup when the session-forget hook fails", async () => {
    const api = new FakeLettaApi();
    const indexes = new InMemoryMemoryIndexRepository([
      createEmptyMemoryScopeIndex(scope),
    ]);
    let hookAttempts = 0;
    const store = new LettaMemoryStore({
      api,
      indexRepository: indexes,
      now,
      onScopeForgotten: () => {
        hookAttempts += 1;
        if (hookAttempts === 1) throw new Error("session cleanup interrupted");
      },
    });
    await store.applyPatch(patch());

    const queued = await store.forget({
      scope,
      target: { type: "scope" },
      reason: "The callback must be recoverable.",
      turnId: "forget-hook-retry",
      approved: true,
    });
    expect(queued.status).toBe("queued");
    expect((await indexes.get(scope))?.pendingForgets).toHaveLength(1);

    await store.initialize();

    expect(hookAttempts).toBe(2);
    expect(await indexes.get(scope)).toMatchObject({
      version: 2,
      epoch: 1,
      pendingForgets: [],
      blockIds: {},
    });
  });
});
