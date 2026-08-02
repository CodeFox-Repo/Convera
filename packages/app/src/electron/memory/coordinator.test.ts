import { describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalAiRuntime } from "../ai/runtime";
import { InMemorySessionStateRepository } from "../ai/session/repository";
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
} from "./settings-repository";
import { LocalMemoryStore } from "./store";
import { InMemorySubconsciousJobRepository } from "./subconscious-job-repository";
import type { CuratorInput } from "./subconscious-worker";
import { InMemoryMemoryBackend } from "./testing/in-memory-memory-backend";
import { JsonLocalMemoryBackend } from "./local-memory-backend";

const timestamp = "2026-07-31T00:00:00.000Z";

function setup(
  callbacks: Partial<
    Pick<
      ConstructorParameters<typeof MemoryIntegrationCoordinator>[0],
      | "onConversationMemoryObserved"
      | "onMemoryContextChanged"
      | "onMemoryScopeForgotten"
      | "workerStopTimeoutMs"
      | "curatorFactory"
    >
  > = {},
) {
  const settings = new MemorySettingsRepository(
    new InMemoryMemorySettingsPersistence(),
  );
  const indexes: MemoryIndexRepository = new InMemoryMemoryIndexRepository();
  const candidates: MemoryCandidateRepository =
    new InMemoryMemoryCandidateRepository();
  const jobs = new InMemorySubconsciousJobRepository();
  const backend = new InMemoryMemoryBackend();
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
    backendFactory: async () => backend,
    now: () => new Date(timestamp),
    ...callbacks,
  });
  return {
    backend,
    candidates,
    coordinator,
    curate,
    indexes,
    jobs,
    settings,
  };
}

function prepare(
  coordinator: MemoryIntegrationCoordinator,
  turnId: string,
  actorId = "agent:fizz",
) {
  return coordinator.prepareTurn({
    turnId,
    conversationId: "conversation-1",
    actorId,
    providerId: "codex-cli",
    revision: 0,
    workingDirectory: "/workspace",
    isNewSession: true,
    requestApproval: async () => false,
  });
}

describe("MemoryIntegrationCoordinator", () => {
  it("does not create a client or tools until memory is explicitly enabled", async () => {
    const { backend, coordinator, settings } = setup();
    await settings.update({ provider: "off" });

    const prepared = await prepare(coordinator, "turn-off");

    expect(prepared.additionalTools).toEqual([]);
    expect(prepared.systemContext).toBeUndefined();
    expect(backend.calls).toEqual([]);
    expect(await coordinator.getMemoryStatus()).toMatchObject({
      health: "disabled",
    });
  });

  it("injects all six memory tools when local memory is enabled", async () => {
    const { coordinator, settings } = setup();
    await settings.update({
      provider: "local",
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
      sourceId: await settings.getSourceId(),
      conversationId: "conversation-1",
      actorId: "agent:fizz",
      scopes: [
        { kind: "user", id: "local-user" },
        { kind: "workspace", id: "/workspace" },
        { kind: "conversation", id: "conversation-1" },
      ],
    });
  });

  it("lets the user protect a conversation block while curator writes remain blocked", async () => {
    const { backend, coordinator, indexes, settings } = setup();
    await settings.update({ provider: "local", curator: "off" });
    const scope = {
      kind: "conversation" as const,
      id: "conversation-1",
    };
    const store = new LocalMemoryStore({
      backend,
      indexRepository: indexes,
      sourceId: await settings.getSourceId(),
      now: () => new Date(timestamp),
    });
    await store.applyPatch({
      scope,
      baseVersion: 0,
      turnId: "user-create",
      provenance: {
        actor: "user",
        turnId: "user-create",
        timestamp,
      },
      operations: [
        {
          type: "upsert_block",
          label: "policy",
          value: "Ask before publishing.",
        },
      ],
    });

    await expect(
      coordinator.getConversationMemoryState(scope.id),
    ).resolves.toMatchObject({
      version: 1,
      blocks: [{ label: "policy", readOnly: false }],
    });
    await expect(
      coordinator.setMemoryBlockReadOnly({
        conversationId: scope.id,
        label: "policy",
        readOnly: true,
      }),
    ).resolves.toMatchObject({
      version: 2,
      blocks: [{ label: "policy", readOnly: true }],
    });

    await expect(
      store.applyPatch({
        scope,
        baseVersion: 2,
        turnId: "curator-overwrite",
        provenance: {
          actor: "subconscious",
          turnId: "curator-overwrite",
          timestamp,
        },
        operations: [
          {
            type: "upsert_block",
            label: "policy",
            value: "Publish without approval.",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "READ_ONLY" });
  });

  it("replays durable write intents when the local memory runtime starts", async () => {
    const { backend, coordinator, indexes, settings } = setup();
    await settings.update({ provider: "local", curator: "off" });
    const scope = {
      kind: "conversation" as const,
      id: "conversation-1",
    };
    const offlineStore = new LocalMemoryStore({
      backend,
      indexRepository: indexes,
      sourceId: await settings.getSourceId(),
      now: () => new Date(timestamp),
    });
    backend.available = false;
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

    backend.available = true;
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
      provider: "local",
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
    expect(curate.mock.calls[0]?.[0].turns[0]).toMatchObject({
      actorId: "agent:fizz",
    });

    await candidates.enqueue({
      id: "turn-2:memory:1",
      sourceId: await settings.getSourceId(),
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
    expect(
      await candidates.listByTurn("turn-2", await settings.getSourceId()),
    ).toEqual([]);
  });

  it("uses the durable terminal time when replaying completion curation", async () => {
    const { coordinator, jobs, settings } = setup();
    await settings.update({
      provider: "local",
      curator: "codex-cli",
      schedule: "batch",
      batchSize: 10,
    });
    const prepared = await prepare(coordinator, "turn-terminal-time");
    const terminalAt = "2026-07-31T01:00:00.000Z";

    await coordinator.replayDurableTurnHook({
      hookId: "turn-terminal-time",
      turnId: "turn-terminal-time",
      conversationId: "conversation-1",
      outcome: "completed",
      status: "pending",
      payload: {
        kind: "memory-turn",
        sourceId: prepared.contextToken!.sourceId,
        turnId: "turn-terminal-time",
        conversationId: "conversation-1",
        actorId: "agent:fizz",
        revision: 0,
        providerId: "codex-cli",
        scopes: prepared.contextToken!.scopes,
        userContent: "stable chronology",
        assistantContent: "persist the original completion time",
      },
      attempts: 2,
      retryable: true,
      createdAt: timestamp,
      terminalAt,
      updatedAt: "2026-07-31T03:00:00.000Z",
    });

    expect((await jobs.list())[0]?.turn).toMatchObject({
      actorId: "agent:fizz",
      completedAt: terminalAt,
    });
  });

  it("retains durable curation while memory is disabled and resumes after settings repair", async () => {
    const { coordinator, jobs, settings } = setup();
    await settings.update({
      provider: "local",
      curator: "codex-cli",
      schedule: "batch",
      batchSize: 10,
    });
    const prepared = await prepare(coordinator, "turn-disabled-hook");
    const sourceId = prepared.contextToken!.sourceId;
    const hook = {
      hookId: "turn-disabled-hook",
      turnId: "turn-disabled-hook",
      conversationId: "conversation-1",
      outcome: "completed" as const,
      status: "pending" as const,
      payload: {
        kind: "memory-turn" as const,
        sourceId,
        turnId: "turn-disabled-hook",
        conversationId: "conversation-1",
        revision: 0,
        providerId: "codex-cli" as const,
        scopes: prepared.contextToken!.scopes,
        userContent: "Retain this work while memory is disabled.",
        assistantContent: "Replay only after settings are repaired.",
      },
      attempts: 0,
      retryable: true,
      createdAt: timestamp,
      terminalAt: timestamp,
      updatedAt: timestamp,
    };

    await coordinator.updateMemorySettings({ provider: "off" });
    await expect(coordinator.replayDurableTurnHook(hook)).rejects.toMatchObject(
      {
        code: "CONFIGURATION",
        retryable: false,
      },
    );
    expect(await jobs.list()).toEqual([]);

    await coordinator.updateMemorySettings({ provider: "local" });
    await coordinator.replayDurableTurnHook(hook);
    expect(await jobs.list()).toEqual([
      expect.objectContaining({
        turn: expect.objectContaining({ sourceId }),
      }),
    ]);
  });

  it("curates and removes only exact-source candidates when sources share a turn id", async () => {
    const { candidates, coordinator, jobs, settings } = setup();
    await settings.update({
      provider: "local",
      curator: "codex-cli",
      schedule: "batch",
      batchSize: 10,
    });
    const prepared = await prepare(coordinator, "turn-shared");
    const sourceId = prepared.contextToken!.sourceId as string;
    const foreignSourceId = "source:foreign-source";
    const candidate = {
      id: "turn-shared:memory:1",
      scope: { kind: "conversation" as const, id: "conversation-1" },
      turnId: "turn-shared:memory:1",
      provenance: {
        actor: "primary-agent" as const,
        turnId: "turn-shared:memory:1",
        timestamp,
        providerId: "codex-cli",
      },
      operation: {
        type: "upsert_block" as const,
        label: "decision",
        value: "Keep source-local candidates isolated.",
      },
    };
    await candidates.enqueue({ ...candidate, sourceId });
    await candidates.enqueue({ ...candidate, sourceId: foreignSourceId });

    await coordinator.replayDurableTurnHook({
      hookId: "turn-shared",
      turnId: "turn-shared",
      conversationId: "conversation-1",
      outcome: "completed",
      status: "pending",
      payload: {
        kind: "memory-turn",
        sourceId,
        turnId: "turn-shared",
        conversationId: "conversation-1",
        revision: 0,
        providerId: "codex-cli",
        scopes: prepared.contextToken!.scopes,
        userContent: "Complete source A without consuming source B.",
        assistantContent: "Only exact-source candidates enter the job.",
      },
      attempts: 0,
      retryable: true,
      createdAt: timestamp,
      terminalAt: timestamp,
      updatedAt: timestamp,
    });

    expect((await jobs.list())[0]?.turn.candidates).toEqual([
      expect.objectContaining({ sourceId }),
    ]);
    await coordinator.flushSubconscious();
    await expect(
      candidates.listByTurn("turn-shared", sourceId),
    ).resolves.toEqual([]);
    await expect(
      candidates.listByTurn("turn-shared", foreignSourceId),
    ).resolves.toHaveLength(1);
  });

  it("cleans a failed turn only inside the hook source", async () => {
    const { candidates, coordinator } = setup();
    const sourceId = "source:source-a";
    const foreignSourceId = "source:source-b";
    const candidate = {
      id: "turn-failed-shared:memory:1",
      scope: { kind: "conversation" as const, id: "conversation-1" },
      turnId: "turn-failed-shared:memory:1",
      provenance: {
        actor: "primary-agent" as const,
        turnId: "turn-failed-shared:memory:1",
        timestamp,
      },
      operation: {
        type: "upsert_block" as const,
        label: "failed",
        value: "Clean only the failed source.",
      },
    };
    await candidates.enqueue({ ...candidate, sourceId });
    await candidates.enqueue({ ...candidate, sourceId: foreignSourceId });

    await coordinator.replayDurableTurnHook({
      hookId: "turn-failed-shared",
      turnId: "turn-failed-shared",
      conversationId: "conversation-1",
      outcome: "failed",
      status: "pending",
      payload: {
        kind: "memory-turn",
        sourceId,
        turnId: "turn-failed-shared",
        conversationId: "conversation-1",
        revision: 0,
        providerId: "codex-cli",
        scopes: [{ kind: "conversation", id: "conversation-1" }],
        userContent: "This turn failed.",
      },
      attempts: 0,
      retryable: true,
      createdAt: timestamp,
      terminalAt: timestamp,
      updatedAt: timestamp,
    });

    await expect(
      candidates.listByTurn("turn-failed-shared", sourceId),
    ).resolves.toEqual([]);
    await expect(
      candidates.listByTurn("turn-failed-shared", foreignSourceId),
    ).resolves.toHaveLength(1);

    await candidates.enqueue({ ...candidate, sourceId });
    await coordinator.onTurnFailed({
      request: {
        requestId: "request-failed-shared",
        conversationId: "conversation-1",
        turnId: "turn-failed-shared",
        providerId: "codex-cli",
        operation: {
          kind: "append",
          message: { role: "user", content: "This turn also failed." },
        },
      },
      error: { name: "Error", message: "provider failed" },
      providerMayHaveAdvanced: false,
      contextToken: {
        kind: "convera-memory-turn",
        sourceId,
        turnId: "turn-failed-shared",
        conversationId: "conversation-1",
        revision: 0,
        scopes: [{ kind: "conversation", id: "conversation-1" }],
      },
    });
    await expect(
      candidates.listByTurn("turn-failed-shared", sourceId),
    ).resolves.toEqual([]);
    await expect(
      candidates.listByTurn("turn-failed-shared", foreignSourceId),
    ).resolves.toHaveLength(1);
  });

  it("reports observed conversation memory and rotates sessions when memory is paused", async () => {
    const observed = vi.fn();
    const rotated = vi.fn();
    const { coordinator, settings } = setup({
      onConversationMemoryObserved: observed,
      onMemoryContextChanged: rotated,
    });
    await settings.update({ provider: "local" });

    await prepare(coordinator, "turn-observed");
    expect(observed).toHaveBeenCalledWith("conversation-1", {
      memoryVersion: 0,
      memoryEpoch: 0,
    });

    await coordinator.updateMemorySettings({ schedule: "batch" });
    expect(rotated).not.toHaveBeenCalled();

    await coordinator.updateMemorySettings({ provider: "off" });
    expect(rotated).toHaveBeenCalledOnce();
  });

  it("keeps old settings when native context rotation fails", async () => {
    const rotation = vi.fn(async () => {
      throw new Error("session repository unavailable");
    });
    const { coordinator, settings } = setup({
      onMemoryContextChanged: rotation,
    });
    await settings.update({ provider: "off" });

    await expect(
      coordinator.updateMemorySettings({ provider: "local" }),
    ).rejects.toThrow("session repository unavailable");

    expect(rotation).toHaveBeenCalledOnce();
    expect(await coordinator.getMemorySettings()).toMatchObject({
      provider: "off",
    });
  });

  it("serializes worker creation with a concurrent settings switch", async () => {
    const { candidates, coordinator, settings } = setup();
    await settings.update({
      provider: "local",
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
    candidates.listByTurn = vi.fn(async (turnId, sourceId) => {
      markStarted?.();
      await gate;
      return originalList(turnId, sourceId);
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
    await settings.update({ provider: "local", curator: "off" });
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
      provider: "local",
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
        sourceId: await settings.getSourceId(),
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
      provider: "local",
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
        sourceId: await settings.getSourceId(),
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
    const { backend, coordinator, indexes, settings } = setup();
    await settings.update({ provider: "local", curator: "off" });
    const store = new LocalMemoryStore({
      backend,
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

  it("forgets local memory while paused and retains a tombstone epoch", async () => {
    const { backend, coordinator, indexes, settings } = setup();
    await coordinator.deleteConversation({
      conversationId: "never-persisted",
      forgetConversationMemory: true,
    });

    await settings.update({ provider: "local", curator: "off" });
    const store = new LocalMemoryStore({
      backend,
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
    await coordinator.deleteConversation({
      conversationId: "conversation-1",
      forgetConversationMemory: true,
    });

    expect(backend.blocks.size).toBe(0);
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

  it("forgets blocks and passages from the persistent local backend", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-local-forget-"));
    const path = join(directory, "memory.json");
    const backend = new JsonLocalMemoryBackend({ path });
    const settings = new MemorySettingsRepository(
      new InMemoryMemorySettingsPersistence(),
    );
    const indexes = new InMemoryMemoryIndexRepository();
    const candidates = new InMemoryMemoryCandidateRepository();
    const jobs = new InMemorySubconsciousJobRepository();
    const onMemoryScopeForgotten = vi.fn(async () => undefined);
    const coordinator = new MemoryIntegrationCoordinator({
      settingsRepository: settings,
      indexRepository: indexes,
      candidateRepository: candidates,
      jobRepository: jobs,
      curatorFactory: {
        create: async () => ({
          curate: async () => ({
            action: "noop" as const,
            reason: "Not used.",
          }),
        }),
      },
      backendFactory: async () => backend,
      onMemoryScopeForgotten,
      now: () => new Date(timestamp),
    });
    await settings.update({ provider: "local", curator: "off" });
    const scope = {
      kind: "conversation" as const,
      id: "local-conversation",
    };
    const store = new LocalMemoryStore({
      backend,
      indexRepository: indexes,
      sourceId: await settings.getSourceId(),
      now: () => new Date(timestamp),
    });
    await store.applyPatch({
      scope,
      baseVersion: 0,
      turnId: "seed-local-delete",
      provenance: {
        actor: "system",
        turnId: "seed-local-delete",
        timestamp,
      },
      operations: [
        {
          type: "upsert_block",
          label: "working_state",
          value: "Delete this local block.",
        },
        {
          type: "insert_passage",
          content: "Delete this local passage.",
        },
      ],
    });

    await coordinator.deleteConversation({
      conversationId: scope.id,
      forgetConversationMemory: true,
      operationId: "local-delete",
    });

    const recovered = new JsonLocalMemoryBackend({ path });
    expect(await recovered.listBlocks()).toEqual([]);
    expect(await recovered.listArchives()).toEqual([]);
    expect(await indexes.get(scope)).toMatchObject({
      sourceId: "local:v1",
      blockIds: {},
    });
    expect((await indexes.get(scope))?.archiveId).toBeUndefined();
    expect((await indexes.get(scope))?.checkpoint).toBeUndefined();
    expect(onMemoryScopeForgotten).toHaveBeenCalledOnce();
  });

  it("pauses and resumes local memory without changing source or deleting data", async () => {
    const { backend, coordinator, indexes, settings } = setup();
    await settings.update({ provider: "local", curator: "off" });
    const sourceId = await settings.getSourceId();
    const scope = {
      kind: "conversation" as const,
      id: "conversation-1",
    };
    const store = new LocalMemoryStore({
      backend,
      indexRepository: indexes,
      sourceId,
      now: () => new Date(timestamp),
    });
    await store.applyPatch({
      scope,
      baseVersion: 0,
      turnId: "seed-local-pause",
      provenance: {
        actor: "system",
        turnId: "seed-local-pause",
        timestamp,
      },
      operations: [
        {
          type: "upsert_block",
          label: "durable",
          value: "Keep this while memory is off.",
        },
      ],
    });

    await coordinator.updateMemorySettings({ provider: "off" });
    expect((await prepare(coordinator, "paused")).additionalTools).toEqual([]);
    await coordinator.updateMemorySettings({ provider: "local" });
    const resumed = await prepare(coordinator, "resumed");

    expect(resumed.contextToken?.sourceId).toBe(sourceId);
    expect(resumed.systemContext).toContain("Keep this while memory is off.");
    expect(backend.blocks.size).toBe(1);
  });

  it("cancels an active curator before waiting for the worker to stop", async () => {
    let started!: () => void;
    let release!: () => void;
    const curatorStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const providerReleased = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const { coordinator, settings } = setup({
      workerStopTimeoutMs: 50,
      curatorFactory: {
        create: async () => ({
          curate: async () => {
            started();
            await providerReleased;
            return { action: "noop" as const, reason: "Cancelled." };
          },
          cancel: () => {
            order.push("cancel");
            release();
          },
          dispose: () => {
            order.push("dispose");
          },
        }),
      },
    });
    await settings.update({ provider: "local", curator: "codex-cli" });
    const prepared = await prepare(coordinator, "turn-cancel-curator");
    await coordinator.completeTurn({
      token: prepared.contextToken!,
      turnId: "turn-cancel-curator",
      providerId: "codex-cli",
      userContent: "Remember this.",
      assistantContent: "Okay.",
    });
    await curatorStarted;

    await coordinator.updateMemorySettings({ provider: "off" });

    expect(order).toEqual(["cancel", "dispose"]);
  });

  it("bounds shutdown when a curator ignores cancellation", async () => {
    let started!: () => void;
    const curatorStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const never = new Promise<never>(() => undefined);
    const cancel = vi.fn();
    const { coordinator, settings } = setup({
      workerStopTimeoutMs: 5,
      curatorFactory: {
        create: async () => ({
          curate: async () => {
            started();
            return never;
          },
          cancel,
          dispose: () => never,
        }),
      },
    });
    await settings.update({ provider: "local", curator: "codex-cli" });
    const prepared = await prepare(coordinator, "turn-hung-curator");
    await coordinator.completeTurn({
      token: prepared.contextToken!,
      turnId: "turn-hung-curator",
      providerId: "codex-cli",
      userContent: "Remember this.",
      assistantContent: "Okay.",
    });
    await curatorStarted;

    await expect(
      Promise.race([
        coordinator.updateMemorySettings({ provider: "off" }),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error("shutdown remained hung")), 250),
        ),
      ]),
    ).resolves.toMatchObject({ provider: "off" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("replays deletion after response loss without forgetting an empty tombstone twice", async () => {
    const onMemoryScopeForgotten = vi.fn(async () => undefined);
    const { backend, candidates, coordinator, indexes, jobs, settings } = setup(
      {
        onMemoryScopeForgotten,
      },
    );
    const scope = {
      kind: "conversation" as const,
      id: "response-loss-conversation",
    };
    await settings.update({ provider: "local", curator: "off" });
    const store = new LocalMemoryStore({
      backend,
      indexRepository: indexes,
      sourceId: await settings.getSourceId(),
      now: () => new Date(timestamp),
    });
    await store.applyPatch({
      scope,
      baseVersion: 0,
      turnId: "seed-response-loss-delete",
      provenance: {
        actor: "system",
        turnId: "seed-response-loss-delete",
        timestamp,
      },
      operations: [
        {
          type: "upsert_block",
          label: "working_state",
          value: "Delete exactly once.",
        },
      ],
    });

    class FailFirstSessionDeleteRepository extends InMemorySessionStateRepository {
      private failNextDelete = true;

      override async completeConversationDeletion(conversationId: string) {
        if (this.failNextDelete) {
          this.failNextDelete = false;
          throw new Error("injected session delete response loss");
        }
        return super.completeConversationDeletion(conversationId);
      }
    }

    const sessions = new FailFirstSessionDeleteRepository();
    await sessions.branchConversation("missing-source", scope.id);
    const runtime = new LocalAiRuntime({
      adapters: [],
      sessionRepository: sessions,
      memoryService: coordinator,
    });

    const firstLease = await runtime.quiesceConversation(scope.id);
    await expect(
      runtime.deleteConversation({
        conversationId: scope.id,
        forgetConversationMemory: true,
        leaseToken: firstLease,
      }),
    ).rejects.toThrow("injected session delete response loss");
    expect(await indexes.get(scope)).toMatchObject({
      version: 2,
      epoch: 1,
      blockIds: {},
    });
    expect(onMemoryScopeForgotten).toHaveBeenCalledOnce();
    expect(backend.calls.filter((call) => call === "deleteBlock")).toHaveLength(
      1,
    );

    await candidates.enqueue({
      id: "late-candidate",
      scope,
      turnId: "late-turn",
      provenance: {
        actor: "primary-agent",
        turnId: "late-turn",
        timestamp,
      },
      operation: {
        type: "upsert_block",
        label: "late",
        value: "Must still be cleaned during replay.",
      },
    });
    await jobs.put({
      state: {
        id: "late-job",
        turnIds: ["late-turn"],
        scope,
        status: "queued",
        attempts: 0,
      },
      turn: {
        turnId: "late-turn",
        conversationId: scope.id,
        scope,
        userContent: "Late",
        assistantContent: "Cleanup",
        completedAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const retryLease = await runtime.quiesceConversation(scope.id);
    await expect(
      runtime.deleteConversation({
        conversationId: scope.id,
        forgetConversationMemory: true,
        leaseToken: retryLease,
      }),
    ).resolves.toBe(true);
    expect(await sessions.getConversation(scope.id)).toBeUndefined();
    expect(
      await candidates.listByTurn("late-turn", await settings.getSourceId()),
    ).toEqual([]);
    expect(await jobs.list()).toEqual([]);

    // The renderer may replay once more after main completed but its response
    // was lost. Main deletion remains idempotent and memory stays at epoch 1.
    const replayLease = await runtime.quiesceConversation(scope.id);
    await expect(
      runtime.deleteConversation({
        conversationId: scope.id,
        forgetConversationMemory: true,
        leaseToken: replayLease,
      }),
    ).resolves.toBe(true);
    expect(await indexes.get(scope)).toMatchObject({
      version: 2,
      epoch: 1,
      blockIds: {},
    });
    expect(onMemoryScopeForgotten).toHaveBeenCalledOnce();
    expect(backend.calls.filter((call) => call === "deleteBlock")).toHaveLength(
      1,
    );
  });
});
