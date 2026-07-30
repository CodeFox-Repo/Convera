import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  InMemorySessionStateRepository,
  JsonSessionStateRepository,
} from "./repository";

const temporaryDirectories: string[] = [];

async function statePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "convera-session-state-"));
  temporaryDirectories.push(directory);
  return join(directory, "runtime-state.json");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("SessionStateRepository", () => {
  it("owns revisions and binds sessions by conversation, provider, and revision", async () => {
    const repository = new InMemorySessionStateRepository({
      clock: () => new Date("2026-07-31T00:00:00.000Z"),
    });

    const first = await repository.beginTurn({
      turnId: "turn-1",
      requestId: "request-1",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "append",
      expectedRevision: 0,
    });
    expect(first.turn.revision).toBe(0);
    expect(first.binding).toBeUndefined();
    await repository.completeTurn({
      turnId: first.turn.turnId,
      nativeSessionId: "thread-1",
      cwd: "/workspace",
      modelId: "gpt-test",
    });

    const continued = await repository.beginTurn({
      turnId: "turn-2",
      requestId: "request-2",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "append",
      expectedRevision: 0,
    });
    expect(continued.binding?.nativeSessionId).toBe("thread-1");
    await repository.failTurn(continued.turn.turnId, "aborted");

    const rebased = await repository.beginTurn({
      turnId: "turn-3",
      requestId: "request-3",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "rebase",
      expectedRevision: 0,
    });
    expect(rebased.turn.revision).toBe(1);
    expect(rebased.binding).toBeUndefined();

    await expect(
      repository.beginTurn({
        turnId: "turn-stale",
        requestId: "request-stale",
        conversationId: "conversation",
        providerId: "codex-cli",
        operation: "append",
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: "LOCAL_AI_STALE_REVISION" });
  });

  it("rotates a pending turn before provider start and atomically commits memory cursors", async () => {
    const repository = new InMemorySessionStateRepository();
    const seed = await repository.beginTurn({
      turnId: "seed-turn",
      requestId: "seed-request",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "bootstrap",
    });
    await repository.completeTurn({
      turnId: seed.turn.turnId,
      nativeSessionId: "thread-old",
      cwd: "/workspace",
      memoryCursors: {
        user: { version: 1, epoch: 0 },
      },
    });

    const pending = await repository.beginTurn({
      turnId: "rotate-turn",
      requestId: "rotate-request",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "append",
      expectedRevision: 0,
    });
    expect(pending.binding?.nativeSessionId).toBe("thread-old");

    const rotated = await repository.rotatePendingTurn(pending.turn.turnId);
    expect(rotated).toMatchObject({
      turn: { revision: 1 },
      conversation: { revision: 1 },
      binding: undefined,
    });
    const binding = await repository.completeTurn({
      turnId: pending.turn.turnId,
      nativeSessionId: "thread-new",
      cwd: "/workspace",
      memoryCursors: {
        user: { version: 2, epoch: 1 },
      },
    });
    expect(binding.memoryCursors).toEqual({
      user: { version: 2, epoch: 1 },
    });
    expect(await repository.getBindings("conversation")).toEqual([
      expect.objectContaining({
        revision: 0,
        nativeSessionId: "thread-old",
      }),
      expect.objectContaining({
        revision: 1,
        nativeSessionId: "thread-new",
      }),
    ]);
  });

  it("atomically persists state and recovers pending turns on startup", async () => {
    const path = await statePath();
    const clock = () => new Date("2026-07-31T01:02:03.000Z");
    const repository = new JsonSessionStateRepository({ path, clock });
    await repository.beginTurn({
      turnId: "pending-turn",
      requestId: "pending-request",
      conversationId: "conversation",
      providerId: "claude-code",
      operation: "bootstrap",
    });

    const persisted = JSON.parse(await readFile(path, "utf8")) as {
      schemaVersion: number;
      turns: Array<{ status: string }>;
    };
    expect(persisted).toMatchObject({
      schemaVersion: 1,
      turns: [{ status: "pending" }],
    });

    const recovered = new JsonSessionStateRepository({ path, clock });
    expect(await recovered.getTurn("pending-turn")).toMatchObject({
      status: "interrupted",
      completedAt: "2026-07-31T01:02:03.000Z",
    });
    expect(
      (await readdir(dirname(path))).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("invalidates a binding when startup recovers a provider-started turn", async () => {
    const path = await statePath();
    const repository = new JsonSessionStateRepository({ path });
    const first = await repository.beginTurn({
      turnId: "turn-1",
      requestId: "request-1",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "bootstrap",
    });
    await repository.completeTurn({
      turnId: first.turn.turnId,
      nativeSessionId: "thread-1",
      cwd: "/workspace",
    });
    const second = await repository.beginTurn({
      turnId: "turn-2",
      requestId: "request-2",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "append",
    });
    await repository.markProviderStarted(second.turn.turnId);

    const recovered = new JsonSessionStateRepository({ path });
    expect(await recovered.getTurn(second.turn.turnId)).toMatchObject({
      status: "uncertain",
    });
    expect(await recovered.getBindings("conversation")).toEqual([
      expect.objectContaining({ nativeSessionId: "thread-1", stale: true }),
    ]);
    await expect(
      recovered.beginTurn({
        turnId: "turn-3",
        requestId: "request-3",
        conversationId: "conversation",
        providerId: "codex-cli",
        operation: "append",
      }),
    ).rejects.toMatchObject({ code: "LOCAL_AI_SESSION_REBASE_REQUIRED" });
  });

  it("serializes concurrent writes without losing turns", async () => {
    const path = await statePath();
    const repository = new JsonSessionStateRepository({ path });

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        repository.beginTurn({
          turnId: `turn-${index}`,
          requestId: `request-${index}`,
          conversationId: `conversation-${index}`,
          providerId: "codex-cli",
          operation: "append",
        }),
      ),
    );

    expect((await repository.snapshot()).turns).toHaveLength(12);
    expect(
      (JSON.parse(await readFile(path, "utf8")) as { turns: unknown[] }).turns,
    ).toHaveLength(12);
  });

  it("persists memory cursors and exposes atomic lifecycle operations", async () => {
    const repository = new InMemorySessionStateRepository();
    await repository.setConversationMemoryState("source", {
      memoryEpoch: 2,
      memoryVersion: 7,
    });
    const first = await repository.beginTurn({
      turnId: "turn-1",
      requestId: "request-1",
      conversationId: "source",
      providerId: "claude-code",
      operation: "bootstrap",
    });
    await repository.completeTurn({
      turnId: first.turn.turnId,
      nativeSessionId: "session-1",
      cwd: "/workspace",
      memoryCursors: {
        user: { epoch: 1, version: 4 },
        workspace: { epoch: 2, version: 6 },
        conversation: { epoch: 2, version: 7 },
      },
    });

    const second = await repository.beginTurn({
      turnId: "turn-2",
      requestId: "request-2",
      conversationId: "source",
      providerId: "claude-code",
      operation: "append",
    });
    await repository.completeTurn({
      turnId: second.turn.turnId,
      nativeSessionId: "session-2",
      cwd: "/workspace",
    });
    expect(await repository.getBindings("source")).toEqual([
      expect.objectContaining({
        nativeSessionId: "session-2",
        memoryCursors: {
          user: { epoch: 1, version: 4 },
          workspace: { epoch: 2, version: 6 },
          conversation: { epoch: 2, version: 7 },
        },
      }),
    ]);

    expect(
      await repository.branchConversation("source", "branch"),
    ).toMatchObject({
      conversationId: "branch",
      revision: 0,
      memoryEpoch: 2,
      memoryVersion: 7,
    });
    expect(await repository.getBindings("branch")).toEqual([]);

    await repository.resetProvider("source", "claude-code");
    expect(await repository.getBindings("source")).toEqual([]);
    expect(await repository.deleteConversation("source")).toBe(true);
    expect(await repository.getConversation("source")).toBeUndefined();
    expect(await repository.deleteConversation("source")).toBe(false);
  });

  it("refuses unsupported state schemas instead of overwriting them", async () => {
    const path = await statePath();
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: 999,
        conversations: [],
        bindings: [],
        turns: [],
      }),
      "utf8",
    );

    const repository = new JsonSessionStateRepository({ path });
    await expect(repository.snapshot()).rejects.toMatchObject({
      code: "LOCAL_AI_SESSION_STATE_INVALID",
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      schemaVersion: 999,
    });
  });
});
