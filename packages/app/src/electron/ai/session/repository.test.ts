import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACKNOWLEDGED_TURNS_GLOBAL_LIMIT,
  ACKNOWLEDGED_TURNS_PER_CONVERSATION_LIMIT,
  COMPLETED_DELETION_TOMBSTONE_LIMIT,
  InMemorySessionStateRepository,
  JsonSessionStateRepository,
  TURN_HOOK_TEXT_LIMIT,
  TURN_HOOK_TRUNCATION_MARKER,
  TURN_RECOVERY_TEXT_LIMIT,
  TURN_RECOVERY_TRUNCATION_MARKER,
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

  it("keeps terminal delivery payload until renderer persistence is acknowledged", async () => {
    const path = await statePath();
    const repository = new JsonSessionStateRepository({
      path,
      clock: () => new Date("2026-07-31T00:00:00.000Z"),
    });
    await repository.beginTurn({
      turnId: "turn-outbox",
      requestId: "request-outbox",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "bootstrap",
    });
    await repository.completeTurn({
      turnId: "turn-outbox",
      nativeSessionId: "thread-outbox",
      cwd: "/workspace",
      modelId: "gpt-test",
      finishReason: "stop",
      assistantText: "durable assistant answer",
    });

    const recovered = new JsonSessionStateRepository({
      path,
      clock: () => new Date("2026-07-31T00:00:00.000Z"),
    });
    await expect(
      recovered.getTurnRuntimeState("conversation", "turn-outbox"),
    ).resolves.toMatchObject({
      status: "completed",
      assistantText: "durable assistant answer",
      finishReason: "stop",
      modelId: "gpt-test",
    });
    await expect(
      recovered.acknowledgeTurnPersistence("conversation", "turn-outbox"),
    ).resolves.toBe(true);
    await expect(
      recovered.acknowledgeTurnPersistence("conversation", "turn-outbox"),
    ).resolves.toBe(true);
    const acknowledged = await recovered.getTurnRuntimeState(
      "conversation",
      "turn-outbox",
    );
    expect(acknowledged).toMatchObject({
      status: "completed",
      rendererPersistedAt: "2026-07-31T00:00:00.000Z",
    });
    expect(acknowledged?.assistantText).toBeUndefined();
    await expect(
      recovered.getTurnRuntimeState("other-conversation", "turn-outbox"),
    ).resolves.toBeUndefined();
    expect(await readFile(path, "utf8")).not.toContain(
      "durable assistant answer",
    );
  });

  it("bounds a large recovery payload and reloads the durable state", async () => {
    const path = await statePath();
    const repository = new JsonSessionStateRepository({ path });
    await repository.beginTurn({
      turnId: "large-turn",
      requestId: "large-request",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "bootstrap",
    });
    const largeText = `${"h".repeat(250_000)}${"t".repeat(250_000)}`;
    await repository.completeTurn({
      turnId: "large-turn",
      nativeSessionId: "large-thread",
      cwd: "/workspace",
      assistantText: largeText,
      finishReason: "stop",
    });

    const recovered = new JsonSessionStateRepository({ path });
    const state = await recovered.getTurnRuntimeState(
      "conversation",
      "large-turn",
    );
    expect(state?.assistantTextTruncated).toBe(true);
    expect(state?.assistantText).toHaveLength(TURN_RECOVERY_TEXT_LIMIT);
    expect(state?.assistantText).toContain(TURN_RECOVERY_TRUNCATION_MARKER);
    expect(state?.assistantText?.startsWith("h")).toBe(true);
    expect(state?.assistantText?.endsWith("t")).toBe(true);
  });

  it("bounds acknowledged metadata without pruning uncertain or unacknowledged turns", async () => {
    const timestamp = (index: number) =>
      new Date(Date.UTC(2026, 6, 31, 0, 0, index)).toISOString();
    const conversations = Array.from({ length: 11 }, (_, index) => ({
      conversationId: `conversation-${index}`,
      revision: 0,
      transcriptVersion: 0,
      memoryEpoch: 0,
      memoryVersion: 0,
      updatedAt: timestamp(index),
    }));
    const acknowledged = Array.from({ length: 1_105 }, (_, index) => ({
      turnId: `acknowledged-${index}`,
      requestId: `request-${index}`,
      conversationId: `conversation-${index % conversations.length}`,
      providerId: "codex-cli" as const,
      revision: 0,
      operation: "append" as const,
      status: "completed" as const,
      startedAt: timestamp(index),
      completedAt: timestamp(index),
      finishReason: "stop" as const,
      rendererPersistedAt: timestamp(index),
    }));
    const protectedTurns = [
      {
        turnId: "uncertain-protected",
        requestId: "uncertain-request",
        conversationId: "conversation-0",
        providerId: "codex-cli" as const,
        revision: 0,
        operation: "append" as const,
        status: "uncertain" as const,
        startedAt: timestamp(2_000),
        completedAt: timestamp(2_000),
        finishReason: "error" as const,
        rendererPersistedAt: timestamp(2_000),
      },
      {
        turnId: "unacknowledged-protected",
        requestId: "unacknowledged-request",
        conversationId: "conversation-0",
        providerId: "codex-cli" as const,
        revision: 0,
        operation: "append" as const,
        status: "completed" as const,
        startedAt: timestamp(2_001),
        completedAt: timestamp(2_001),
        finishReason: "stop" as const,
        assistantText: "not delivered",
      },
      {
        turnId: "ack-trigger",
        requestId: "ack-trigger-request",
        conversationId: "conversation-0",
        providerId: "codex-cli" as const,
        revision: 0,
        operation: "append" as const,
        status: "completed" as const,
        startedAt: timestamp(2_002),
        completedAt: timestamp(2_002),
        finishReason: "stop" as const,
        assistantText: "delivered now",
      },
    ];
    const repository = new InMemorySessionStateRepository({
      initialState: {
        schemaVersion: 2,
        conversations,
        bindings: [],
        turns: [...acknowledged, ...protectedTurns],
      },
      clock: () => new Date(timestamp(3_000)),
    });

    await repository.acknowledgeTurnPersistence(
      "conversation-0",
      "ack-trigger",
    );
    const turns = (await repository.snapshot()).turns;
    expect(
      turns.filter(
        (turn) =>
          turn.rendererPersistedAt &&
          turn.status !== "uncertain" &&
          turn.conversationId === "conversation-0",
      ).length,
    ).toBeLessThanOrEqual(ACKNOWLEDGED_TURNS_PER_CONVERSATION_LIMIT);
    expect(
      turns.filter(
        (turn) => turn.rendererPersistedAt && turn.status !== "uncertain",
      ).length,
    ).toBeLessThanOrEqual(ACKNOWLEDGED_TURNS_GLOBAL_LIMIT);
    expect(turns.map((turn) => turn.turnId)).toEqual(
      expect.arrayContaining([
        "uncertain-protected",
        "unacknowledged-protected",
        "ack-trigger",
      ]),
    );
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
      schemaVersion: 2,
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

    const bootstrap = await recovered.beginTurn({
      turnId: "turn-4",
      requestId: "request-4",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "bootstrap",
      expectedRevision: 0,
    });
    expect(bootstrap.turn.revision).toBe(1);
    expect(bootstrap.binding).toBeUndefined();
    await recovered.completeTurn({
      turnId: bootstrap.turn.turnId,
      nativeSessionId: "thread-2",
      cwd: "/workspace",
    });

    const continued = await recovered.beginTurn({
      turnId: "turn-5",
      requestId: "request-5",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "append",
      expectedRevision: 1,
    });
    expect(continued.binding).toMatchObject({
      nativeSessionId: "thread-2",
      revision: 1,
      stale: false,
    });
  });

  it("forces A to B to A provider switches through transcript rebases", async () => {
    const repository = new InMemorySessionStateRepository();
    const first = await repository.beginTurn({
      turnId: "turn-a-1",
      requestId: "request-a-1",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "append",
    });
    await repository.completeTurn({
      turnId: first.turn.turnId,
      nativeSessionId: "codex-thread-1",
      cwd: "/workspace",
    });

    await expect(
      repository.beginTurn({
        turnId: "turn-b-invalid",
        requestId: "request-b-invalid",
        conversationId: "conversation",
        providerId: "claude-code",
        operation: "bootstrap",
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: "LOCAL_AI_PROVIDER_REBASE_REQUIRED" });

    const switchedToClaude = await repository.beginTurn({
      turnId: "turn-b-1",
      requestId: "request-b-1",
      conversationId: "conversation",
      providerId: "claude-code",
      operation: "rebase",
      operationReason: "provider-switch",
      expectedRevision: 0,
    });
    expect(switchedToClaude).toMatchObject({
      turn: { revision: 1, operationReason: "provider-switch" },
      binding: undefined,
    });
    await repository.completeTurn({
      turnId: switchedToClaude.turn.turnId,
      nativeSessionId: "claude-session-1",
      cwd: "/workspace",
    });

    await expect(
      repository.beginTurn({
        turnId: "turn-a-invalid",
        requestId: "request-a-invalid",
        conversationId: "conversation",
        providerId: "codex-cli",
        operation: "append",
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "LOCAL_AI_PROVIDER_REBASE_REQUIRED" });

    const switchedBackToCodex = await repository.beginTurn({
      turnId: "turn-a-2",
      requestId: "request-a-2",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "rebase",
      operationReason: "provider-switch",
      expectedRevision: 1,
    });
    expect(switchedBackToCodex.turn.revision).toBe(2);
    const binding = await repository.completeTurn({
      turnId: switchedBackToCodex.turn.turnId,
      nativeSessionId: "codex-thread-2",
      cwd: "/workspace",
    });

    expect(binding).toMatchObject({
      revision: 2,
      transcriptVersion: 3,
      nativeSessionId: "codex-thread-2",
    });
    expect(await repository.getConversation("conversation")).toMatchObject({
      revision: 2,
      transcriptVersion: 3,
      lastCompletedProviderId: "codex-cli",
    });
  });

  it("keeps a crashed provider switch fenced until a fresh rebase", async () => {
    const path = await statePath();
    const repository = new JsonSessionStateRepository({ path });
    const first = await repository.beginTurn({
      turnId: "turn-a",
      requestId: "request-a",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "append",
    });
    await repository.completeTurn({
      turnId: first.turn.turnId,
      nativeSessionId: "codex-thread",
      cwd: "/workspace",
    });
    const switching = await repository.beginTurn({
      turnId: "turn-b",
      requestId: "request-b",
      conversationId: "conversation",
      providerId: "claude-code",
      operation: "rebase",
      operationReason: "provider-switch",
    });
    expect(switching.turn.revision).toBe(1);
    await repository.markProviderStarted(switching.turn.turnId);

    const recovered = new JsonSessionStateRepository({ path });
    expect(await recovered.getTurn(switching.turn.turnId)).toMatchObject({
      status: "uncertain",
      operationReason: "provider-switch",
    });
    expect(await recovered.getConversation("conversation")).toMatchObject({
      revision: 1,
      transcriptVersion: 1,
      lastCompletedProviderId: "codex-cli",
    });
    await expect(
      recovered.beginTurn({
        turnId: "turn-b-append",
        requestId: "request-b-append",
        conversationId: "conversation",
        providerId: "claude-code",
        operation: "append",
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "LOCAL_AI_PROVIDER_REBASE_REQUIRED" });

    const retried = await recovered.beginTurn({
      turnId: "turn-b-retry",
      requestId: "request-b-retry",
      conversationId: "conversation",
      providerId: "claude-code",
      operation: "rebase",
      operationReason: "provider-switch",
      expectedRevision: 1,
    });
    expect(retried.turn.revision).toBe(2);
  });

  it("rejects bootstrap when a durable binding trails shared transcript", async () => {
    const timestamp = "2026-07-31T00:00:00.000Z";
    const repository = new InMemorySessionStateRepository({
      initialState: {
        schemaVersion: 2,
        conversations: [
          {
            conversationId: "conversation",
            revision: 0,
            transcriptVersion: 2,
            lastCompletedProviderId: "codex-cli",
            memoryEpoch: 0,
            memoryVersion: 0,
            updatedAt: timestamp,
          },
        ],
        bindings: [
          {
            conversationId: "conversation",
            providerId: "codex-cli",
            revision: 0,
            transcriptVersion: 1,
            nativeSessionId: "thread-behind",
            cwd: "/workspace",
            stale: false,
            updatedAt: timestamp,
          },
        ],
        turns: [],
      },
    });

    await expect(
      repository.beginTurn({
        turnId: "turn-bootstrap",
        requestId: "request-bootstrap",
        conversationId: "conversation",
        providerId: "codex-cli",
        operation: "bootstrap",
      }),
    ).rejects.toMatchObject({ code: "LOCAL_AI_PROVIDER_REBASE_REQUIRED" });
    await expect(
      repository.beginTurn({
        turnId: "turn-rebase",
        requestId: "request-rebase",
        conversationId: "conversation",
        providerId: "codex-cli",
        operation: "rebase",
        operationReason: "provider-switch",
      }),
    ).resolves.toMatchObject({
      turn: { revision: 1, operationReason: "provider-switch" },
      binding: undefined,
    });
  });

  it("migrates legacy bindings conservatively behind a transcript cursor", async () => {
    const path = await statePath();
    const timestamp = "2026-07-31T00:00:00.000Z";
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: 1,
        conversations: [
          {
            conversationId: "conversation",
            revision: 0,
            memoryEpoch: 0,
            memoryVersion: 0,
            updatedAt: timestamp,
          },
        ],
        bindings: [
          {
            conversationId: "conversation",
            providerId: "codex-cli",
            revision: 0,
            nativeSessionId: "legacy-thread",
            cwd: "/workspace",
            stale: false,
            updatedAt: timestamp,
          },
        ],
        turns: [
          {
            turnId: "legacy-turn",
            requestId: "legacy-request",
            conversationId: "conversation",
            providerId: "codex-cli",
            revision: 0,
            operation: "append",
            status: "completed",
            startedAt: timestamp,
            completedAt: timestamp,
            nativeSessionId: "legacy-thread",
          },
        ],
      }),
      "utf8",
    );

    const repository = new JsonSessionStateRepository({ path });
    expect(await repository.getConversation("conversation")).toMatchObject({
      transcriptVersion: 1,
      lastCompletedProviderId: "codex-cli",
    });
    expect(await repository.getBindings("conversation")).toEqual([
      expect.objectContaining({ transcriptVersion: 0, stale: true }),
    ]);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      schemaVersion: 2,
    });
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

    expect(await repository.rotateAllForMemoryContextChange()).toBe(2);
    expect(await repository.getConversation("source")).toMatchObject({
      revision: 1,
      memoryEpoch: 3,
      memoryVersion: 0,
    });
    expect(await repository.getConversation("branch")).toMatchObject({
      revision: 1,
      memoryEpoch: 3,
      memoryVersion: 0,
    });

    expect(await repository.deleteConversation("source")).toBe(true);
    expect(await repository.getConversation("source")).toBeUndefined();
    expect(await repository.deleteConversation("source")).toBe(false);
  });

  it("persists deletion intent across restart and fences resurrection", async () => {
    const path = await statePath();
    const clock = () => new Date("2026-07-31T12:00:00.000Z");
    const repository = new JsonSessionStateRepository({ path, clock });
    await repository.beginTurn({
      turnId: "seed-turn",
      requestId: "seed-request",
      conversationId: "conversation-to-delete",
      providerId: "codex-cli",
      operation: "bootstrap",
    });
    await repository.completeTurn({
      turnId: "seed-turn",
      nativeSessionId: "seed-session",
      cwd: "/workspace",
    });

    const prepared = await repository.beginConversationDeletion(
      "conversation-to-delete",
      true,
    );
    await repository.failConversationDeletion(
      "conversation-to-delete",
      "remote forget unavailable",
    );

    const recovered = new JsonSessionStateRepository({ path, clock });
    await expect(
      recovered.getConversationDeletion("conversation-to-delete"),
    ).resolves.toMatchObject({
      operationId: prepared.operationId,
      forgetConversationMemory: true,
      status: "deleting",
      lastError: "remote forget unavailable",
    });
    await expect(
      recovered.getConversation("conversation-to-delete"),
    ).resolves.toBeUndefined();
    await expect(
      recovered.getBindings("conversation-to-delete"),
    ).resolves.toEqual([]);
    await expect(
      recovered.getTurnRuntimeState("conversation-to-delete", "seed-turn"),
    ).resolves.toBeUndefined();
    await expect(
      recovered.beginTurn({
        turnId: "late-turn",
        requestId: "late-request",
        conversationId: "conversation-to-delete",
        providerId: "codex-cli",
        operation: "append",
      }),
    ).rejects.toMatchObject({ code: "LOCAL_AI_CONVERSATION_DELETING" });
    await expect(
      recovered.branchConversation("conversation-to-delete", "late-branch"),
    ).rejects.toMatchObject({ code: "LOCAL_AI_CONVERSATION_DELETING" });
    await expect(
      recovered.branchConversation(
        "untracked-source",
        "conversation-to-delete",
      ),
    ).rejects.toMatchObject({ code: "LOCAL_AI_CONVERSATION_DELETING" });

    const replay = await recovered.beginConversationDeletion(
      "conversation-to-delete",
      true,
    );
    expect(replay.operationId).toBe(prepared.operationId);
    await recovered.completeConversationDeletion("conversation-to-delete");

    const completed = new JsonSessionStateRepository({ path, clock });
    await expect(
      completed.getConversationDeletion("conversation-to-delete"),
    ).resolves.toMatchObject({
      operationId: prepared.operationId,
      status: "completed",
      completedAt: "2026-07-31T12:00:00.000Z",
    });
    await expect(
      completed.getConversation("conversation-to-delete"),
    ).resolves.toBeUndefined();
    await expect(
      completed.beginTurn({
        turnId: "resurrection-turn",
        requestId: "resurrection-request",
        conversationId: "conversation-to-delete",
        providerId: "codex-cli",
        operation: "bootstrap",
      }),
    ).rejects.toMatchObject({ code: "LOCAL_AI_CONVERSATION_DELETED" });
    await expect(
      completed.setConversationMemoryState("conversation-to-delete", {
        memoryEpoch: 1,
        memoryVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "LOCAL_AI_CONVERSATION_DELETED" });
  });

  it("bounds completed deletion tombstones without pruning active deletion work", async () => {
    const oldTimestamp = "2026-07-01T00:00:00.000Z";
    const deletingConversationId = "still-deleting";
    const completingConversationId = "completing-now";
    const repository = new InMemorySessionStateRepository({
      clock: () => new Date("2026-07-31T12:00:00.000Z"),
      initialState: {
        schemaVersion: 2,
        conversations: [
          {
            conversationId: completingConversationId,
            revision: 0,
            transcriptVersion: 0,
            memoryEpoch: 0,
            memoryVersion: 0,
            updatedAt: oldTimestamp,
          },
        ],
        bindings: [],
        turns: [],
        deletions: [
          ...Array.from(
            { length: COMPLETED_DELETION_TOMBSTONE_LIMIT + 1 },
            (_, index) => ({
              conversationId: `completed-${index}`,
              operationId: `operation-${index}`,
              forgetConversationMemory: true,
              status: "completed" as const,
              startedAt: oldTimestamp,
              updatedAt: new Date(
                Date.parse(oldTimestamp) + index,
              ).toISOString(),
              completedAt: new Date(
                Date.parse(oldTimestamp) + index,
              ).toISOString(),
            }),
          ),
          {
            conversationId: deletingConversationId,
            operationId: "operation-still-deleting",
            forgetConversationMemory: true,
            status: "deleting",
            startedAt: oldTimestamp,
            updatedAt: oldTimestamp,
          },
          {
            conversationId: completingConversationId,
            operationId: "operation-completing-now",
            forgetConversationMemory: true,
            status: "deleting",
            startedAt: oldTimestamp,
            updatedAt: oldTimestamp,
          },
        ],
      },
    });

    await repository.completeConversationDeletion(completingConversationId);
    const deletions = (await repository.snapshot()).deletions ?? [];
    expect(
      deletions.filter((deletion) => deletion.status === "completed"),
    ).toHaveLength(COMPLETED_DELETION_TOMBSTONE_LIMIT);
    expect(
      deletions.find(
        (deletion) => deletion.conversationId === deletingConversationId,
      ),
    ).toMatchObject({ status: "deleting" });
    expect(
      deletions.find(
        (deletion) => deletion.conversationId === completingConversationId,
      ),
    ).toMatchObject({ status: "completed" });
    expect(
      deletions.find((deletion) => deletion.conversationId === "completed-0"),
    ).toBeUndefined();
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

  it("rejects malformed nested state and persists private durable files", async () => {
    const malformedPath = await statePath();
    const malformed = {
      schemaVersion: 1,
      conversations: [
        {
          conversationId: "conversation",
          revision: "not-an-integer",
          memoryEpoch: 0,
          memoryVersion: 0,
          updatedAt: "not-a-timestamp",
        },
      ],
      bindings: [],
      turns: [],
    };
    await writeFile(malformedPath, JSON.stringify(malformed), "utf8");
    await expect(
      new JsonSessionStateRepository({ path: malformedPath }).snapshot(),
    ).rejects.toMatchObject({ code: "LOCAL_AI_SESSION_STATE_INVALID" });
    expect(JSON.parse(await readFile(malformedPath, "utf8"))).toEqual(
      malformed,
    );

    const privatePath = await statePath();
    const repository = new JsonSessionStateRepository({ path: privatePath });
    await repository.beginTurn({
      turnId: "turn-private",
      requestId: "request-private",
      conversationId: "conversation-private",
      providerId: "codex-cli",
      operation: "append",
    });
    if (process.platform !== "win32") {
      expect((await stat(privatePath)).mode & 0o777).toBe(0o600);
    }
  });

  it("atomically retains a bounded completion hook after renderer acknowledgement", async () => {
    const repository = new InMemorySessionStateRepository({
      clock: () => new Date("2026-07-31T00:00:00.000Z"),
    });
    await repository.beginTurn({
      turnId: "turn-memory-outbox",
      requestId: "request-memory-outbox",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "bootstrap",
    });
    await repository.armTurnHook("turn-memory-outbox", {
      kind: "memory-turn",
      sourceId: "letta:source-a",
      turnId: "turn-memory-outbox",
      conversationId: "conversation",
      revision: 0,
      providerId: "codex-cli",
      scopes: [{ kind: "conversation", id: "conversation" }],
      userContent: `user-head${"u".repeat(TURN_HOOK_TEXT_LIMIT)}user-tail`,
    });
    await repository.completeTurn({
      turnId: "turn-memory-outbox",
      nativeSessionId: "thread",
      cwd: "/workspace",
      assistantText: "renderer recovery",
      assistantHookContent: `assistant-head${"a".repeat(TURN_HOOK_TEXT_LIMIT)}assistant-tail`,
    });
    await repository.acknowledgeTurnPersistence(
      "conversation",
      "turn-memory-outbox",
    );

    expect(
      await repository.getTurnRuntimeState(
        "conversation",
        "turn-memory-outbox",
      ),
    ).toHaveProperty("assistantText", undefined);
    const hooks = await repository.listReplayableTurnHooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toMatchObject({
      outcome: "completed",
      status: "pending",
      payload: {
        sourceId: "letta:source-a",
        userContentTruncated: true,
        assistantContentTruncated: true,
      },
    });
    expect(hooks[0]?.payload.userContent).toHaveLength(TURN_HOOK_TEXT_LIMIT);
    expect(hooks[0]?.payload.userContent).toContain(
      TURN_HOOK_TRUNCATION_MARKER,
    );
    expect(hooks[0]?.payload.assistantContent).toHaveLength(
      TURN_HOOK_TEXT_LIMIT,
    );
  });

  it("recovers an armed hook as failure cleanup and deletion fences replay", async () => {
    const path = await statePath();
    const clock = () => new Date("2026-07-31T00:00:00.000Z");
    const repository = new JsonSessionStateRepository({ path, clock });
    await repository.beginTurn({
      turnId: "turn-crashed",
      requestId: "request-crashed",
      conversationId: "conversation",
      providerId: "claude-code",
      operation: "bootstrap",
    });
    await repository.armTurnHook("turn-crashed", {
      kind: "memory-turn",
      turnId: "turn-crashed",
      conversationId: "conversation",
      revision: 0,
      providerId: "claude-code",
      scopes: [{ kind: "conversation", id: "conversation" }],
      userContent: "remember nothing from a crashed turn",
    });

    const recovered = new JsonSessionStateRepository({ path, clock });
    await expect(recovered.listReplayableTurnHooks()).resolves.toMatchObject([
      { turnId: "turn-crashed", outcome: "failed", status: "pending" },
    ]);
    await recovered.beginConversationDeletion("conversation", true);
    await expect(recovered.listReplayableTurnHooks()).resolves.toEqual([]);
  });

  it("keeps the terminal chronology stable across replay failures", async () => {
    let now = new Date("2026-07-31T00:00:00.000Z");
    const repository = new InMemorySessionStateRepository({
      clock: () => now,
    });
    await repository.beginTurn({
      turnId: "turn-chronology",
      requestId: "request-chronology",
      conversationId: "conversation",
      providerId: "codex-cli",
      operation: "bootstrap",
    });
    await repository.armTurnHook("turn-chronology", {
      kind: "memory-turn",
      turnId: "turn-chronology",
      conversationId: "conversation",
      revision: 0,
      providerId: "codex-cli",
      scopes: [{ kind: "conversation", id: "conversation" }],
      userContent: "chronology",
    });
    now = new Date("2026-07-31T01:00:00.000Z");
    await repository.completeTurn({
      turnId: "turn-chronology",
      nativeSessionId: "thread",
      cwd: "/workspace",
      assistantHookContent: "assistant",
    });
    now = new Date("2026-07-31T02:00:00.000Z");
    await repository.failTurnHook(
      "turn-chronology",
      "temporary Letta outage",
      true,
    );

    expect((await repository.snapshot()).turnHooks?.[0]).toMatchObject({
      terminalAt: "2026-07-31T01:00:00.000Z",
      updatedAt: "2026-07-31T02:00:00.000Z",
    });
  });

  it("persists and selectively resets configuration-paused hooks", async () => {
    const path = await statePath();
    const repository = new JsonSessionStateRepository({ path });
    for (const [turnId, conversationId] of [
      ["configuration-turn", "configuration-conversation"],
      ["permanent-turn", "permanent-conversation"],
    ] as const) {
      await repository.beginTurn({
        turnId,
        requestId: `${turnId}-request`,
        conversationId,
        providerId: "codex-cli",
        operation: "bootstrap",
      });
      await repository.armTurnHook(turnId, {
        kind: "memory-turn",
        turnId,
        conversationId,
        revision: 0,
        providerId: "codex-cli",
        scopes: [{ kind: "conversation", id: conversationId }],
        userContent: "selective retry",
      });
      await repository.completeTurn({
        turnId,
        nativeSessionId: `${turnId}-thread`,
        cwd: "/workspace",
        assistantHookContent: "assistant",
      });
    }
    await repository.failTurnHook(
      "configuration-turn",
      "settings invalid",
      false,
      "configuration",
    );
    await repository.failTurnHook(
      "permanent-turn",
      "permanent validation failure",
      false,
    );

    const recovered = new JsonSessionStateRepository({ path });
    expect((await recovered.snapshot()).turnHooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          turnId: "configuration-turn",
          pauseReason: "configuration",
        }),
        expect.objectContaining({
          turnId: "permanent-turn",
          retryable: false,
        }),
      ]),
    );
    await expect(recovered.resetTurnHookRetries("configuration")).resolves.toBe(
      1,
    );
    await expect(recovered.listReplayableTurnHooks()).resolves.toMatchObject([
      { turnId: "configuration-turn", retryable: true },
    ]);
  });
});
