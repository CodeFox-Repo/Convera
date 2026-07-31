import { describe, expect, it } from "vitest";
import { MemoryContextCompiler } from "./context-compiler";
import type { MemorySnapshot } from "./types";

function snapshot(overrides: Partial<MemorySnapshot> = {}): MemorySnapshot {
  return {
    scope: { kind: "conversation", id: "conversation-1" },
    version: 2,
    epoch: 1,
    checkpoint: "Goal: ship persistent memory.",
    blocks: [
      {
        id: "block-1",
        scope: { kind: "conversation", id: "conversation-1" },
        label: "current_goal",
        value: "Implement local memory.",
        version: 2,
        provenance: {
          actor: "subconscious",
          turnId: "turn-2",
          timestamp: "2026-07-31T00:00:00.000Z",
        },
        updatedAt: "2026-07-31T00:00:00.000Z",
      },
    ],
    deltas: [
      {
        version: 2,
        epoch: 1,
        turnId: "turn-2",
        changedBlockLabels: ["current_goal"],
        summary: "updated block current_goal",
        createdAt: "2026-07-31T00:00:00.000Z",
      },
    ],
    retrievedAt: "2026-07-31T00:00:00.000Z",
    stale: false,
    pendingTurnIds: [],
    ...overrides,
  };
}

const budget = { maxCharacters: 4_000, maxTokens: 1_000 };

describe("MemoryContextCompiler", () => {
  it("bootstraps a new native session with checkpoint and bounded blocks", () => {
    const result = new MemoryContextCompiler().compile({
      snapshots: [snapshot()],
      session: { isNew: true, seen: {} },
      budget,
    });

    expect(result.mode).toBe("bootstrap");
    expect(result.context).toContain("<checkpoint>");
    expect(result.context).toContain('label="current_goal"');
    expect(result.requiresNewSession).toBe(false);
  });

  it("returns no context when the native session has seen the version", () => {
    const result = new MemoryContextCompiler().compile({
      snapshots: [snapshot()],
      session: {
        isNew: false,
        seen: {
          "conversation:conversation-1": { version: 2, epoch: 1 },
        },
      },
      budget,
    });

    expect(result).toMatchObject({ mode: "none", context: "" });
  });

  it("emits only version deltas for an existing native session", () => {
    const result = new MemoryContextCompiler().compile({
      snapshots: [snapshot()],
      session: {
        isNew: false,
        seen: {
          "conversation:conversation-1": { version: 1, epoch: 1 },
        },
      },
      budget,
    });

    expect(result.mode).toBe("delta");
    expect(result.context).toContain('version="2"');
    expect(result.context).not.toContain("<checkpoint>");
  });

  it("requires a clean native session when the memory epoch changes", () => {
    const result = new MemoryContextCompiler().compile({
      snapshots: [snapshot()],
      session: {
        isNew: false,
        seen: {
          "conversation:conversation-1": { version: 99, epoch: 0 },
        },
      },
      budget,
    });

    expect(result.mode).toBe("epoch_reset");
    expect(result.requiresNewSession).toBe(true);
    expect(result.context).toContain("<checkpoint>");
  });

  it("honors the stricter token/character budget without invalid partial text", () => {
    const result = new MemoryContextCompiler().compile({
      snapshots: [
        snapshot({
          blocks: [
            {
              ...snapshot().blocks[0]!,
              value: "<secret>&".repeat(200),
            },
          ],
        }),
      ],
      session: { isNew: true, seen: {} },
      budget: { maxCharacters: 160, maxTokens: 40 },
    });

    expect(result.context.length).toBeLessThanOrEqual(160);
    expect(result.truncated).toBe(true);
    expect(result.context).not.toContain("<secret>");
    expect(result.context.endsWith("</convera_memory>")).toBe(true);
    expect(result.context.match(/<scope(?:\s|>)/g)?.length ?? 0).toBe(
      result.context.match(/<\/scope>/g)?.length ?? 0,
    );
    expect(
      result.context.replace(/&(amp|lt|gt|quot|apos);/g, ""),
    ).not.toContain("&");
    expect(result.cursors).toEqual({});
  });

  it("does not hide an epoch reset when the injection budget is zero", () => {
    const result = new MemoryContextCompiler().compile({
      snapshots: [snapshot()],
      session: {
        isNew: false,
        seen: {
          "conversation:conversation-1": { version: 9, epoch: 0 },
        },
      },
      budget: { maxCharacters: 0, maxTokens: 0 },
    });

    expect(result).toMatchObject({
      mode: "epoch_reset",
      requiresNewSession: true,
      truncated: true,
      cursors: {
        "conversation:conversation-1": { version: 9, epoch: 0 },
      },
    });
  });
});
