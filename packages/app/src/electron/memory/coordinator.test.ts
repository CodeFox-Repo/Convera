import { describe, expect, it, vi } from "vitest";
import {
  InMemoryMemoryCandidateRepository,
  type MemoryCandidateRepository,
} from "./candidate-sink";
import { MemoryIntegrationCoordinator } from "./coordinator";
import {
  InMemoryMemoryIndexRepository,
  type MemoryIndexRepository,
} from "./index-repository";
import {
  InMemoryMemorySettingsPersistence,
  MemorySettingsRepository,
  type SecretCodec,
} from "./settings-repository";
import { LettaMemoryStore } from "./store";
import { InMemorySubconsciousJobRepository } from "./subconscious-job-repository";
import type { CuratorInput } from "./subconscious-worker";
import { FakeLettaApi } from "./testing/fake-letta-api";

const timestamp = "2026-07-31T00:00:00.000Z";

function secretCodec(): SecretCodec {
  return {
    encrypt: async (value) => `encrypted:${value}`,
    decrypt: async (value) => value.replace(/^encrypted:/, ""),
  };
}

function setup(
  callbacks: Pick<
    ConstructorParameters<typeof MemoryIntegrationCoordinator>[0],
    "onConversationMemoryObserved" | "onMemoryContextChanged"
  > = {},
) {
  const settings = new MemorySettingsRepository(
    new InMemoryMemorySettingsPersistence(),
    secretCodec(),
  );
  const indexes: MemoryIndexRepository = new InMemoryMemoryIndexRepository();
  const candidates: MemoryCandidateRepository =
    new InMemoryMemoryCandidateRepository();
  const jobs = new InMemorySubconsciousJobRepository();
  const api = new FakeLettaApi();
  const curate = vi.fn(async (input: CuratorInput) => {
    void input;
    return {
      action: "noop" as const,
      reason: "No durable change.",
    };
  });
  const coordinator = new MemoryIntegrationCoordinator({
    settingsRepository: settings,
    indexRepository: indexes,
    jobRepository: jobs,
    candidateRepository: candidates,
    curatorFactory: {
      create: async () => ({ curate }),
    },
    apiFactory: async () => api,
    now: () => new Date(timestamp),
    ...callbacks,
  });
  return {
    api,
    candidates,
    coordinator,
    curate,
    indexes,
    jobs,
    settings,
  };
}

function prepare(coordinator: MemoryIntegrationCoordinator, turnId: string) {
  return coordinator.prepareTurn({
    turnId,
    conversationId: "conversation-1",
    providerId: "codex-cli",
    revision: 0,
    workingDirectory: "/workspace",
    isNewSession: true,
    requestApproval: async () => false,
  });
}

describe("MemoryIntegrationCoordinator", () => {
  it("does not create a client or tools until memory is explicitly enabled", async () => {
    const { api, coordinator } = setup();

    const prepared = await prepare(coordinator, "turn-off");

    expect(prepared.additionalTools).toEqual([]);
    expect(prepared.systemContext).toBeUndefined();
    expect(api.calls).toEqual([]);
    expect(await coordinator.getMemoryStatus()).toMatchObject({
      health: "disabled",
    });
  });

  it("injects all six memory tools when Letta is enabled", async () => {
    const { coordinator, settings } = setup();
    await settings.update({
      provider: "letta",
      curator: "codex-cli",
    });

    const prepared = await prepare(coordinator, "turn-tools");

    expect(prepared.additionalTools.map((tool) => tool.qualifiedName)).toEqual([
      "memory:get_context",
      "memory:search",
      "memory:learn",
      "memory:correct",
      "memory:forget",
      "memory:status",
    ]);
    expect(prepared.contextToken).toMatchObject({
      conversationId: "conversation-1",
      scopes: [
        { kind: "user", id: "local-user" },
        { kind: "workspace", id: "/workspace" },
        { kind: "conversation", id: "conversation-1" },
      ],
    });
  });

  it("replays durable write intents when the Letta runtime starts", async () => {
    const { api, coordinator, indexes, settings } = setup();
    const scope = {
      kind: "conversation" as const,
      id: "conversation-1",
    };
    const offlineStore = new LettaMemoryStore({
      api,
      indexRepository: indexes,
      sourceId: await settings.getSourceId(),
      now: () => new Date(timestamp),
    });
    api.available = false;
    await expect(
      offlineStore.applyPatch({
        scope,
        baseVersion: 0,
        turnId: "offline-turn",
        provenance: {
          actor: "subconscious",
          turnId: "offline-turn",
          timestamp,
        },
        operations: [
          {
            type: "upsert_block",
            label: "delivery",
            value: "Replay this durable intent.",
          },
        ],
      }),
    ).resolves.toMatchObject({ status: "queued" });

    api.available = true;
    await settings.update({ provider: "letta", curator: "off" });
    await prepare(coordinator, "startup-turn");

    await expect(offlineStore.getSnapshot(scope)).resolves.toMatchObject({
      version: 1,
      blocks: [
        {
          label: "delivery",
          value: "Replay this durable intent.",
        },
      ],
      pendingTurnIds: [],
    });
  });

  it("curates the conversation once and only adds other scopes with explicit candidates", async () => {
    const { candidates, coordinator, curate, settings } = setup();
    await settings.update({
      provider: "letta",
      curator: "codex-cli",
      schedule: "every-turn",
    });
    const first = await prepare(coordinator, "turn-1");

    await coordinator.completeTurn({
      token: first.contextToken!,
      turnId: "turn-1",
      providerId: "codex-cli",
      userContent: "Keep the memory chain local-first.",
      assistantContent: "The provider session owns history.",
    });
    await coordinator.flushSubconscious();
    expect(curate).toHaveBeenCalledOnce();
    expect(curate.mock.calls[0]?.[0].scope).toEqual({
      kind: "conversation",
      id: "conversation-1",
    });

    await candidates.enqueue({
      id: "turn-2:memory:1",
      scope: { kind: "user", id: "local-user" },
      turnId: "turn-2:memory:1",
      provenance: {
        actor: "primary-agent",
        turnId: "turn-2:memory:1",
        timestamp,
        providerId: "codex-cli",
      },
      operation: {
        type: "upsert_block",
        label: "preferences",
        value: "Prefer concise Chinese reports.",
      },
    });
    const second = await prepare(coordinator, "turn-2");
    await coordinator.completeTurn({
      token: second.contextToken!,
      turnId: "turn-2",
      providerId: "codex-cli",
      userContent: "Please remember this preference.",
      assistantContent: "Queued.",
    });
    await coordinator.flushSubconscious();

    const secondTurnScopes = curate.mock.calls
      .slice(1)
      .map((call) => call[0].scope.kind);
    expect(secondTurnScopes).toEqual(["user", "conversation"]);
    expect(await candidates.listByTurn("turn-2")).toEqual([]);
  });

  it("reports observed conversation memory and rotates sessions when the context source changes", async () => {
    const observed = vi.fn();
    const rotated = vi.fn();
    const { coordinator, settings } = setup({
      onConversationMemoryObserved: observed,
      onMemoryContextChanged: rotated,
    });
    await settings.update({ provider: "letta" });

    await prepare(coordinator, "turn-observed");
    expect(observed).toHaveBeenCalledWith("conversation-1", {
      memoryVersion: 0,
      memoryEpoch: 0,
    });

    await coordinator.updateMemorySettings({ schedule: "batch" });
    expect(rotated).not.toHaveBeenCalled();

    await coordinator.updateMemorySettings({
      baseURL: "http://127.0.0.1:8284",
    });
    expect(rotated).toHaveBeenCalledOnce();
  });

  it("rejects a Letta source switch while remote memory is still bound", async () => {
    const { api, coordinator, indexes, settings } = setup();
    await settings.update({ provider: "letta", curator: "off" });
    const store = new LettaMemoryStore({
      api,
      indexRepository: indexes,
      sourceId: await settings.getSourceId(),
      now: () => new Date(timestamp),
    });
    await store.applyPatch({
      scope: { kind: "conversation", id: "conversation-1" },
      baseVersion: 0,
      turnId: "source-bound-memory",
      provenance: {
        actor: "system",
        turnId: "source-bound-memory",
        timestamp,
      },
      operations: [
        {
          type: "upsert_block",
          label: "source_bound",
          value: "This remote id belongs to the current source.",
        },
      ],
    });

    await expect(
      coordinator.updateMemorySettings({
        baseURL: "http://127.0.0.1:9999",
      }),
    ).rejects.toMatchObject({ code: "CONFIGURATION" });
    expect(await coordinator.getMemorySettings()).toMatchObject({
      baseURL: "http://127.0.0.1:8283",
    });
  });

  it("keeps old settings when native context rotation fails", async () => {
    const rotation = vi.fn(async () => {
      throw new Error("session repository unavailable");
    });
    const { coordinator } = setup({ onMemoryContextChanged: rotation });

    await expect(
      coordinator.updateMemorySettings({ provider: "letta" }),
    ).rejects.toThrow("session repository unavailable");

    expect(rotation).toHaveBeenCalledOnce();
    expect(await coordinator.getMemorySettings()).toMatchObject({
      provider: "off",
    });
  });

  it("serializes worker creation with a concurrent settings switch", async () => {
    const { candidates, coordinator, settings } = setup();
    await settings.update({
      provider: "letta",
      curator: "codex-cli",
      schedule: "every-turn",
    });
    const prepared = await prepare(coordinator, "turn-before-switch");
    const originalList = candidates.listByTurn.bind(candidates);
    let markStarted: (() => void) | undefined;
    let release: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    candidates.listByTurn = vi.fn(async (turnId) => {
      markStarted?.();
      await gate;
      return originalList(turnId);
    });

    const completing = coordinator.completeTurn({
      token: prepared.contextToken!,
      turnId: "turn-before-switch",
      providerId: "codex-cli",
      userContent: "Complete against the old generation.",
      assistantContent: "Queued.",
    });
    await started;
    let switched = false;
    const switching = coordinator
      .updateMemorySettings({ schedule: "batch" })
      .then(() => {
        switched = true;
      });
    await Promise.resolve();
    expect(switched).toBe(false);

    release?.();
    await Promise.all([completing, switching]);

    expect(switched).toBe(true);
    expect(
      (
        coordinator as unknown as {
          worker?: unknown;
          runtime?: unknown;
        }
      ).worker,
    ).toBeUndefined();
  });

  it("rejects tools prepared by an invalidated runtime generation", async () => {
    const { coordinator, settings } = setup();
    await settings.update({ provider: "letta", curator: "off" });
    const oldPrepared = await prepare(coordinator, "turn-old-generation");
    const oldContext = oldPrepared.additionalTools.find(
      (tool) => tool.qualifiedName === "memory:get_context",
    );

    await coordinator.updateMemorySettings({ schedule: "batch" });

    await expect(oldContext?.execute({})).resolves.toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
      },
    });

    const newPrepared = await prepare(coordinator, "turn-new-generation");
    const newContext = newPrepared.additionalTools.find(
      (tool) => tool.qualifiedName === "memory:get_context",
    );
    await expect(newContext?.execute({})).resolves.toMatchObject({
      ok: true,
    });
  });

  it("hydrates and flushes persisted jobs without requiring a new turn", async () => {
    const { coordinator, curate, jobs, settings } = setup();
    await settings.update({
      provider: "letta",
      curator: "codex-cli",
      schedule: "idle",
    });
    await jobs.put({
      state: {
        id: "memory-job-41",
        turnIds: ["persisted-turn"],
        scope: { kind: "conversation", id: "conversation-1" },
        status: "queued",
        attempts: 0,
      },
      turn: {
        turnId: "persisted-turn",
        conversationId: "conversation-1",
        scope: { kind: "conversation", id: "conversation-1" },
        userContent: "Remember after restart.",
        assistantContent: "Persisted.",
        completedAt: timestamp,
        providerId: "codex-cli",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await coordinator.flushSubconscious();

    expect(curate).toHaveBeenCalledOnce();
    expect((await jobs.list())[0]?.state.status).toBe("skipped");
  });

  it("hydrates persisted jobs when status is the first post-restart call", async () => {
    const { coordinator, jobs, settings } = setup();
    await settings.update({
      provider: "letta",
      curator: "codex-cli",
      schedule: "idle",
    });
    await jobs.put({
      state: {
        id: "memory-job-42",
        turnIds: ["status-recovery-turn"],
        scope: { kind: "conversation", id: "conversation-1" },
        status: "running",
        attempts: 1,
      },
      turn: {
        turnId: "status-recovery-turn",
        conversationId: "conversation-1",
        scope: { kind: "conversation", id: "conversation-1" },
        userContent: "Recover from status.",
        assistantContent: "Persisted.",
        completedAt: timestamp,
        providerId: "codex-cli",
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await coordinator.getMemoryStatus("conversation-1");
    await vi.waitFor(async () => {
      expect((await jobs.list())[0]?.state.status).toBe("skipped");
    });
  });

  it("rebuilds branch memory only from the transcript at the branch point", async () => {
    const { api, coordinator, indexes, settings } = setup();
    await settings.update({ provider: "letta", curator: "off" });
    const store = new LettaMemoryStore({
      api,
      indexRepository: indexes,
      sourceId: await settings.getSourceId(),
      now: () => new Date(timestamp),
    });
    const sourceScope = {
      kind: "conversation" as const,
      id: "conversation-source",
    };
    const targetScope = {
      kind: "conversation" as const,
      id: "conversation-target",
    };
    await store.applyPatch({
      scope: sourceScope,
      baseVersion: 0,
      turnId: "future-source-turn",
      provenance: {
        actor: "subconscious",
        turnId: "future-source-turn",
        timestamp,
      },
      operations: [
        {
          type: "upsert_block",
          label: "future_decision",
          value: "This fact was learned after the branch point.",
        },
        {
          type: "set_checkpoint",
          value: "Future source checkpoint that must not leak.",
        },
      ],
    });

    await coordinator.branchConversation({
      sourceConversationId: sourceScope.id,
      targetConversationId: targetScope.id,
      throughMessageId: "message-before-future-turn",
      bootstrapMessages: [
        { role: "user", content: "Decision before branch." },
        { role: "assistant", content: "Acknowledged." },
      ],
    });

    const target = await store.getSnapshot(targetScope);
    expect(target.blocks).toEqual([]);
    expect(target.checkpoint).toBe(
      "user: Decision before branch.\nassistant: Acknowledged.",
    );
    expect(target.checkpoint).not.toContain("Future source checkpoint");
    expect(JSON.stringify(target)).not.toContain(
      "This fact was learned after the branch point.",
    );
  });

  it("requires Letta only for an existing remote memory and retains a tombstone epoch", async () => {
    const { api, coordinator, indexes, settings } = setup();
    await coordinator.deleteConversation({
      conversationId: "never-persisted",
      forgetConversationMemory: true,
    });

    await settings.update({ provider: "letta", curator: "off" });
    const store = new LettaMemoryStore({
      api,
      indexRepository: indexes,
      sourceId: await settings.getSourceId(),
      now: () => new Date(timestamp),
    });
    const scope = {
      kind: "conversation" as const,
      id: "conversation-1",
    };
    await store.applyPatch({
      scope,
      baseVersion: 0,
      turnId: "seed-delete",
      provenance: {
        actor: "system",
        turnId: "seed-delete",
        timestamp,
      },
      operations: [
        {
          type: "upsert_block",
          label: "working_state",
          value: "Delete this memory.",
        },
      ],
    });
    await settings.update({ provider: "off" });
    await expect(
      coordinator.deleteConversation({
        conversationId: "conversation-1",
        forgetConversationMemory: true,
      }),
    ).rejects.toMatchObject({ code: "CONFIGURATION" });

    await settings.update({ provider: "letta" });
    await coordinator.deleteConversation({
      conversationId: "conversation-1",
      forgetConversationMemory: true,
    });

    expect(api.blocks.size).toBe(0);
    expect(await indexes.get(scope)).toMatchObject({
      version: 2,
      epoch: 1,
      blockIds: {},
    });

    await settings.update({ provider: "off" });
    await coordinator.deleteConversation({
      conversationId: "conversation-1",
      forgetConversationMemory: true,
    });
    expect(await indexes.get(scope)).toMatchObject({
      version: 2,
      epoch: 1,
      blockIds: {},
    });
  });
});
