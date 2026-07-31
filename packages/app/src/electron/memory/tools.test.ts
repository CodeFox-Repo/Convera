import { describe, expect, it, vi } from "vitest";
import { InMemoryMemoryCandidateRepository } from "./candidate-sink";
import {
  createEmptyMemoryScopeIndex,
  InMemoryMemoryIndexRepository,
} from "./index-repository";
import { LocalMemoryStore } from "./store";
import { InMemoryMemoryBackend } from "./testing/in-memory-memory-backend";
import { createMemoryAgentTools, createMemoryTools } from "./tools";

const scope = { kind: "conversation" as const, id: "conversation-1" };

function toolExecutor(tool: unknown) {
  return (
    tool as {
      execute(input: Record<string, unknown>): Promise<unknown>;
    }
  ).execute;
}

function setup(approved: boolean) {
  const sourceId = "source:a";
  const backend = new InMemoryMemoryBackend();
  const indexes = new InMemoryMemoryIndexRepository([
    createEmptyMemoryScopeIndex(scope),
  ]);
  const store = new LocalMemoryStore({ backend, indexRepository: indexes });
  const candidates = new InMemoryMemoryCandidateRepository();
  const requestApproval = vi.fn(async () => ({ approved }));
  const tools = createMemoryTools({
    store,
    sourceId,
    activeScope: scope,
    turnId: "turn-main",
    candidateSink: candidates,
    requestApproval,
    now: () => new Date("2026-07-31T00:00:00.000Z"),
  });
  return { backend, candidates, requestApproval, sourceId, store, tools };
}

describe("memory tools", () => {
  it("queues learn and correction candidates without canonical writes", async () => {
    const { backend, candidates, sourceId, store, tools } = setup(true);
    const learn = await toolExecutor(tools.memory_learn)({
      storage: "block",
      label: "preferences",
      content: "Prefers concise reports.",
    });
    const correct = await toolExecutor(tools.memory_correct)({
      memoryId: "passage-old",
      replacement: "Prefers detailed reports.",
      reason: "The user corrected the preference.",
    });

    expect(learn).toMatchObject({ ok: true, status: "queued" });
    expect(correct).toMatchObject({ ok: true, status: "queued" });
    expect(await candidates.listByTurn("turn-main", sourceId)).toEqual([
      expect.objectContaining({ sourceId }),
      expect.objectContaining({ sourceId }),
    ]);
    expect((await store.getSnapshot(scope)).version).toBe(0);
    expect(backend.blocks.size).toBe(0);
  });

  it("requires fresh explicit approval for memory_forget", async () => {
    const denied = setup(false);
    const deniedResult = await toolExecutor(denied.tools.memory_forget)({
      target: { type: "scope" },
      reason: "User requested deletion.",
    });
    expect(deniedResult).toMatchObject({
      ok: true,
      status: "approval_required",
    });
    expect(denied.requestApproval).toHaveBeenCalledOnce();
  });

  it("exports provider-native AgentTool definitions with shared validation", async () => {
    const backend = new InMemoryMemoryBackend();
    const store = new LocalMemoryStore({
      backend,
      indexRepository: new InMemoryMemoryIndexRepository([
        createEmptyMemoryScopeIndex(scope),
      ]),
    });
    const candidates = new InMemoryMemoryCandidateRepository();
    const tools = createMemoryAgentTools({
      store,
      sourceId: "source:a",
      activeScope: scope,
      turnId: "turn-agent",
      candidateSink: candidates,
      requestApproval: async () => ({ approved: false }),
    });
    const learn = tools.find(
      (definition) => definition.qualifiedName === "memory:learn",
    );

    expect(tools).toHaveLength(6);
    expect(learn).toMatchObject({
      name: "memory_learn",
      qualifiedName: "memory:learn",
    });
    expect(learn?.inputSchema).toMatchObject({ type: "object" });
    await expect(
      learn?.execute({
        storage: "block",
        content: "Missing its required label.",
      }),
    ).rejects.toThrow("label is required");
    await expect(
      learn?.execute({
        storage: "block",
        label: "decisions",
        content: "Native tools share the candidate pipeline.",
      }),
    ).resolves.toMatchObject({ ok: true, status: "queued" });
    expect(await candidates.listByTurn("turn-agent", "source:a")).toEqual([
      expect.objectContaining({ sourceId: "source:a" }),
    ]);
  });
});
