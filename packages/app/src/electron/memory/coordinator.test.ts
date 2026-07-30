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

function setup() {
  const settings = new MemorySettingsRepository(
    new InMemoryMemorySettingsPersistence(),
    secretCodec(),
  );
  const indexes: MemoryIndexRepository =
    new InMemoryMemoryIndexRepository();
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
  });
  return {
    api,
    candidates,
    coordinator,
    curate,
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

    expect(
      prepared.additionalTools.map((tool) => tool.qualifiedName),
    ).toEqual([
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
});
