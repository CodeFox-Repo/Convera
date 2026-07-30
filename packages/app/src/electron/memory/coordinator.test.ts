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
