import "fake-indexeddb/auto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { LocalAITurnRuntimeState } from "@/shared/types/local-ai";
import { db, type Conversation } from "./db/database";
import {
  failPendingTurn,
  stagePendingTurn,
  updatePendingTurnJournalState,
} from "./db/hooks";
import {
  LIVE_FINALIZER_GRACE_MS,
  TURN_NOT_FOUND_GRACE_MS,
} from "./conversation-turn-reconciliation-plan";
import {
  reconcilePendingTurn,
  reconcilePendingTurns,
} from "./conversation-turn-reconciliation";
import {
  deleteConversationWithRuntime,
  prepareConversationDeletionIntent,
  replayPendingConversationDeletion,
  replayPendingConversationDeletions,
} from "./conversation-lifecycle";
import {
  completeConversationTurnPersistence,
  getPendingConversationTurnIds,
  registerConversationTurnPersistence,
} from "./conversation-turn-persistence";

const conversationId = "conversation-1";
const now = new Date(Date.now() - 60_000);

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function conversation(): Conversation {
  return {
    id: conversationId,
    title: null,
    agentId: null,
    modelId: "codex-cli:default",
    activeRevision: 0,
    activeProviderId: "codex-cli",
    activeModelId: "default",
    systemPrompt: null,
    metadata: { messageCount: 1 },
    createdAt: now,
    updatedAt: now,
  };
}

function completedRuntime(
  overrides: Partial<LocalAITurnRuntimeState> = {},
): LocalAITurnRuntimeState {
  return {
    conversationId,
    turnId: "turn-1",
    requestId: "request-1",
    providerId: "codex-cli",
    modelId: "default",
    revision: 1,
    status: "completed",
    startedAt: now.toISOString(),
    completedAt: new Date(now.getTime() + 100).toISOString(),
    finishReason: "stop",
    assistantText: "outbox fallback",
    ...overrides,
  };
}

async function seedBase(): Promise<void> {
  await db.conversations.add(conversation());
  await db.messages.add({
    id: "user-1",
    conversationId,
    role: "user",
    content: "hello",
    status: "completed",
    createdAt: now,
  });
}

async function stageAppend(): Promise<void> {
  await stagePendingTurn(
    conversationId,
    [{ id: "user-1", role: "user", content: "hello" }],
    [
      { id: "user-1", role: "user", content: "hello" },
      { id: "user-2", role: "user", content: "next" },
      { id: "assistant-2", role: "assistant", content: "", parts: [] },
    ],
    {
      turnId: "turn-1",
      requestId: "request-1",
      revision: 0,
      providerId: "codex-cli",
      modelId: "default",
      operation: "append",
      userMessageId: "user-2",
      assistantMessageId: "assistant-2",
    },
  );
  await updatePendingTurnJournalState(conversationId, "turn-1", "accepted");
}

function installLocalAI(
  runtime: LocalAITurnRuntimeState | null,
  options: { acknowledged?: boolean } = {},
) {
  const getTurnRuntimeState = vi.fn(async () => ({
    success: true as const,
    data: runtime,
  }));
  const acknowledgeTurnPersistence = vi.fn(async () => ({
    success: true as const,
    data: { acknowledged: options.acknowledged ?? true },
  }));
  vi.stubGlobal("window", {
    localAI: { getTurnRuntimeState, acknowledgeTurnPersistence },
  });
  return { getTurnRuntimeState, acknowledgeTurnPersistence };
}

function installDeletionRuntime(
  deleteConversation: () => Promise<{
    success: boolean;
    data?: { deleted: boolean };
    error?: { message: string; retryable?: boolean };
  }>,
) {
  const quiesceConversation = vi.fn(async () => ({
    success: true as const,
    data: { quiesced: true as const, leaseToken: "lease-delete" },
  }));
  const resumeConversation = vi.fn(async () => ({
    success: true as const,
    data: { resumed: true },
  }));
  const deleteConversationMock = vi.fn(deleteConversation);
  vi.stubGlobal("window", {
    localAI: {
      quiesceConversation,
      resumeConversation,
      deleteConversation: deleteConversationMock,
      getTurnRuntimeState: vi.fn(),
      acknowledgeTurnPersistence: vi.fn(),
    },
  });
  return {
    quiesceConversation,
    resumeConversation,
    deleteConversation: deleteConversationMock,
  };
}

beforeEach(async () => {
  vi.unstubAllGlobals();
  db.close();
  await db.delete();
  await db.open();
});

afterEach(() => {
  completeConversationTurnPersistence("turn-1");
  completeConversationTurnPersistence("turn-2");
});

afterAll(async () => {
  db.close();
  await db.delete();
});

describe("durable turn reconciliation", () => {
  it("serializes two renderer stages without deleting the first turn", async () => {
    await seedBase();
    await stageAppend();

    await expect(
      stagePendingTurn(
        conversationId,
        [{ id: "user-1", role: "user", content: "hello" }],
        [
          { id: "user-1", role: "user", content: "hello" },
          { id: "user-3", role: "user", content: "racing window" },
          { id: "assistant-3", role: "assistant", content: "" },
        ],
        {
          turnId: "turn-2",
          requestId: "request-2",
          revision: 0,
          providerId: "codex-cli",
          operation: "append",
          userMessageId: "user-3",
          assistantMessageId: "assistant-3",
        },
      ),
    ).rejects.toThrow("already has an outgoing turn");
    expect(await db.messages.get("user-2")).toMatchObject({
      content: "next",
      status: "pending",
    });
    expect(await db.messages.get("user-3")).toBeUndefined();
  });

  it("keeps a failed shell fenced while its journal is unresolved", async () => {
    await seedBase();
    await stageAppend();
    await failPendingTurn(conversationId, "turn-1", "aborted");

    await expect(
      stagePendingTurn(
        conversationId,
        [
          { id: "user-1", role: "user", content: "hello" },
          {
            id: "user-2",
            role: "user",
            content: "next",
            status: "failed",
          },
          {
            id: "assistant-2",
            role: "assistant",
            content: "",
            status: "failed",
          },
        ],
        [
          { id: "user-1", role: "user", content: "hello" },
          { id: "user-2", role: "user", content: "next" },
          { id: "assistant-2", role: "assistant", content: "" },
          { id: "user-3", role: "user", content: "must wait" },
          { id: "assistant-3", role: "assistant", content: "" },
        ],
        {
          turnId: "turn-2",
          requestId: "request-2",
          revision: 0,
          providerId: "codex-cli",
          operation: "append",
          userMessageId: "user-3",
          assistantMessageId: "assistant-3",
        },
      ),
    ).rejects.toThrow("awaiting reconciliation");
    expect(await db.pendingTurns.get("turn-1")).toBeDefined();
    expect(await db.pendingTurns.get("turn-2")).toBeUndefined();
  });

  it("clears an acknowledged old journal before a new turn can stage", async () => {
    await seedBase();
    await stageAppend();
    const runtime = completedRuntime();
    installLocalAI(runtime, { acknowledged: false });
    await reconcilePendingTurn("turn-1", {
      liveAssistant: { content: "first answer" },
    });
    const expected = [
      { id: "user-1", role: "user" as const, content: "hello" },
      { id: "user-2", role: "user" as const, content: "next" },
      {
        id: "assistant-2",
        role: "assistant" as const,
        content: "first answer",
      },
    ];
    const pending = [
      ...expected,
      { id: "user-3", role: "user" as const, content: "second" },
      { id: "assistant-3", role: "assistant" as const, content: "" },
    ];
    const secondTurn = {
      turnId: "turn-2",
      requestId: "request-2",
      revision: 1,
      providerId: "codex-cli",
      operation: "append" as const,
      userMessageId: "user-3",
      assistantMessageId: "assistant-3",
    };

    await expect(
      stagePendingTurn(conversationId, expected, pending, secondTurn),
    ).rejects.toThrow("awaiting reconciliation");

    installLocalAI(runtime);
    await reconcilePendingTurn("turn-1");
    await stagePendingTurn(conversationId, expected, pending, secondTurn);
    await reconcilePendingTurn("turn-1");

    expect(await db.pendingTurns.get("turn-1")).toBeUndefined();
    expect(await db.pendingTurns.get("turn-2")).toBeDefined();
    expect(await db.messages.get("user-3")).toMatchObject({
      content: "second",
      status: "pending",
    });
  });

  it("preserves live tool/reasoning parts before acknowledging main", async () => {
    await seedBase();
    await stageAppend();
    const runtime = completedRuntime();
    const localAI = installLocalAI(runtime);
    const parts = [
      { type: "reasoning", text: "thought" },
      { type: "tool-result", toolCallId: "tool-1", output: "result" },
    ];

    const result = await reconcilePendingTurn("turn-1", {
      liveAssistant: {
        content: "complete live answer",
        parts,
      },
    });

    expect(result.locallySettled).toBe(true);
    expect(localAI.acknowledgeTurnPersistence).toHaveBeenCalledOnce();
    expect(await db.messages.get("assistant-2")).toMatchObject({
      content: "complete live answer",
      parts,
      status: "completed",
      finishReason: "stop",
      revision: 1,
    });
    expect(await db.pendingTurns.get("turn-1")).toBeUndefined();
  });

  it("defers a background fallback race, then lets the live owner win", async () => {
    await seedBase();
    await stageAppend();
    const runtime = completedRuntime();
    const localAI = installLocalAI(runtime);
    const completedAt = new Date(runtime.completedAt!).getTime();

    const background = await reconcilePendingTurn("turn-1", {
      preferLiveGrace: true,
      now: completedAt + LIVE_FINALIZER_GRACE_MS - 1,
    });
    expect(background.action).toBe("defer");
    expect(localAI.acknowledgeTurnPersistence).not.toHaveBeenCalled();

    await reconcilePendingTurn("turn-1", {
      liveAssistant: {
        content: "live answer",
        parts: [{ type: "reasoning", text: "kept" }],
      },
    });
    expect(await db.messages.get("assistant-2")).toMatchObject({
      content: "live answer",
      parts: [{ type: "reasoning", text: "kept" }],
    });
  });

  it("recovers outbox text after reload when no live stream survives", async () => {
    await seedBase();
    await stageAppend();
    installLocalAI(
      completedRuntime({
        assistantText: "head\n[Convera recovery truncated]\ntail",
        completedAt: new Date(
          now.getTime() - LIVE_FINALIZER_GRACE_MS - 1,
        ).toISOString(),
      }),
    );

    await reconcilePendingTurn("turn-1", {
      preferLiveGrace: true,
      now: new Date(now.getTime() + 100).getTime() + LIVE_FINALIZER_GRACE_MS,
    });

    expect(await db.messages.get("assistant-2")).toMatchObject({
      content: "head\n[Convera recovery truncated]\ntail",
      status: "completed",
    });
  });

  it("restores only this edit after a stable main not-found", async () => {
    await seedBase();
    await stagePendingTurn(
      conversationId,
      [{ id: "user-1", role: "user", content: "hello" }],
      [
        { id: "user-1", role: "user", content: "edited" },
        { id: "assistant-2", role: "assistant", content: "" },
      ],
      {
        turnId: "turn-1",
        requestId: "request-1",
        revision: 0,
        providerId: "codex-cli",
        operation: "rebase",
        operationReason: "edit",
        sourceMessageId: "user-1",
        userMessageId: "user-1",
        assistantMessageId: "assistant-2",
      },
    );
    installLocalAI(null);

    const stagedJournal = await db.pendingTurns.get("turn-1");
    const deferred = await reconcilePendingTurn("turn-1", {
      now: stagedJournal!.createdAt.getTime() + TURN_NOT_FOUND_GRACE_MS - 1,
    });
    expect(deferred.action).toBe("defer");
    expect(await db.messages.get("user-1")).toMatchObject({
      content: "edited",
      status: "pending",
    });

    const restored = await reconcilePendingTurn("turn-1", {
      stableNotFound: true,
    });
    expect(restored.action).toBe("rollback");
    expect(await db.messages.get("user-1")).toMatchObject({
      content: "hello",
      status: "completed",
    });
    expect(await db.messages.get("assistant-2")).toBeUndefined();
    expect(await db.pendingTurns.get("turn-1")).toBeUndefined();
  });

  it("keeps partial live parts when a normal append is aborted", async () => {
    await seedBase();
    await stageAppend();
    installLocalAI(
      completedRuntime({
        status: "aborted",
        finishReason: "aborted",
        assistantText: undefined,
      }),
    );
    const parts = [{ type: "reasoning", text: "partial thought" }];

    await reconcilePendingTurn("turn-1", {
      liveAssistant: { content: "partial answer", parts },
    });

    expect(await db.messages.get("assistant-2")).toMatchObject({
      content: "partial answer",
      parts,
      status: "aborted",
      finishReason: "aborted",
    });
  });

  it("settles A even when B reconciliation fails in the same scan", async () => {
    await seedBase();
    await stageAppend();
    registerConversationTurnPersistence(conversationId, "turn-1");
    const secondConversation = {
      ...conversation(),
      id: "conversation-2",
    };
    await db.conversations.add(secondConversation);
    await db.messages.add({
      id: "user-b1",
      conversationId: "conversation-2",
      role: "user",
      content: "hello B",
      status: "completed",
      createdAt: now,
    });
    await stagePendingTurn(
      "conversation-2",
      [{ id: "user-b1", role: "user", content: "hello B" }],
      [
        { id: "user-b1", role: "user", content: "hello B" },
        { id: "user-b2", role: "user", content: "next B" },
        { id: "assistant-b2", role: "assistant", content: "" },
      ],
      {
        turnId: "turn-2",
        requestId: "request-2",
        revision: 0,
        providerId: "codex-cli",
        operation: "append",
        userMessageId: "user-b2",
        assistantMessageId: "assistant-b2",
      },
    );
    registerConversationTurnPersistence("conversation-2", "turn-2");
    vi.stubGlobal("window", {
      localAI: {
        getTurnRuntimeState: vi.fn(async ({ turnId }: { turnId: string }) =>
          turnId === "turn-1"
            ? { success: true as const, data: completedRuntime() }
            : {
                success: false as const,
                error: { message: "outbox unavailable" },
              },
        ),
        acknowledgeTurnPersistence: vi.fn(async () => ({
          success: true as const,
          data: { acknowledged: true },
        })),
      },
    });

    const results = await reconcilePendingTurns();

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          turnId: "turn-1",
          locallySettled: true,
        }),
        expect.objectContaining({
          turnId: "turn-2",
          action: "error",
          locallySettled: false,
        }),
      ]),
    );
    expect(getPendingConversationTurnIds(conversationId)).toEqual([]);
    expect(getPendingConversationTurnIds("conversation-2")).toEqual(["turn-2"]);
  });

  it("restores live parts when main deletion fails after reconciliation", async () => {
    await seedBase();
    await stageAppend();
    const runtime = completedRuntime();
    installLocalAI(runtime, { acknowledged: false });
    const parts = [{ type: "reasoning", text: "must survive rollback" }];
    await reconcilePendingTurn("turn-1", {
      liveAssistant: { content: "live answer", parts },
    });
    expect(await db.pendingTurns.get("turn-1")).toMatchObject({
      state: "committed-awaiting-ack",
    });

    const resumeConversation = vi.fn(async () => ({
      success: true as const,
      data: { resumed: true },
    }));
    vi.stubGlobal("window", {
      localAI: {
        getTurnRuntimeState: vi.fn(async () => ({
          success: true as const,
          data: runtime,
        })),
        acknowledgeTurnPersistence: vi.fn(async () => ({
          success: true as const,
          data: { acknowledged: true },
        })),
        quiesceConversation: vi.fn(async () => ({
          success: true as const,
          data: { quiesced: true as const, leaseToken: "lease-1" },
        })),
        deleteConversation: vi.fn(async () => ({
          success: false as const,
          error: { message: "main delete failed" },
        })),
        resumeConversation,
      },
    });

    await expect(deleteConversationWithRuntime(conversationId)).rejects.toThrow(
      "main delete failed",
    );
    expect(await db.conversations.get(conversationId)).toBeDefined();
    expect(await db.messages.get("assistant-2")).toMatchObject({
      content: "live answer",
      parts,
      status: "completed",
    });
    expect(resumeConversation).toHaveBeenCalledWith({
      conversationId,
      leaseToken: "lease-1",
    });
    expect(
      await db.pendingConversationDeletions.get(conversationId),
    ).toMatchObject({
      state: "failed",
      attempts: 1,
      lastError: "main delete failed",
    });
  });

  it("keeps data hidden behind a durable intent before main deletion", async () => {
    await seedBase();

    await prepareConversationDeletionIntent(conversationId, true);

    expect(await db.conversations.get(conversationId)).toBeDefined();
    expect(await db.messages.get("user-1")).toBeDefined();
    expect(
      await db.pendingConversationDeletions.get(conversationId),
    ).toMatchObject({
      forgetConversationMemory: true,
      state: "pending",
      attempts: 0,
    });
  });

  it("replays a response-lost main success and then clears everything", async () => {
    await seedBase();
    const lostResponseRuntime = installDeletionRuntime(async () => {
      throw new Error("IPC channel closed after main commit");
    });

    await expect(deleteConversationWithRuntime(conversationId)).rejects.toThrow(
      "IPC channel closed",
    );
    expect(await db.conversations.get(conversationId)).toBeDefined();
    expect(
      await db.pendingConversationDeletions.get(conversationId),
    ).toMatchObject({
      state: "failed",
      attempts: 1,
    });
    await expect(replayPendingConversationDeletions()).resolves.toEqual([
      expect.objectContaining({
        conversationId,
        deleted: false,
        skipped: true,
      }),
    ]);
    expect(lostResponseRuntime.deleteConversation).toHaveBeenCalledOnce();

    const replayRuntime = installDeletionRuntime(async () => ({
      success: true,
      data: { deleted: true },
    }));
    await replayPendingConversationDeletion(conversationId);

    expect(replayRuntime.deleteConversation).toHaveBeenCalledOnce();
    expect(await db.conversations.get(conversationId)).toBeUndefined();
    expect(
      await db.messages.where("conversationId").equals(conversationId).count(),
    ).toBe(0);
    expect(
      await db.pendingConversationDeletions.get(conversationId),
    ).toBeUndefined();
  });

  it("does not auto-retry a permanent deletion failure after reload", async () => {
    await seedBase();
    installDeletionRuntime(async () => ({
      success: false,
      error: {
        message: "Enable Letta before forgetting persisted memory.",
        retryable: false,
      },
    }));

    await expect(deleteConversationWithRuntime(conversationId)).rejects.toThrow(
      "Enable Letta",
    );
    expect(
      await db.pendingConversationDeletions.get(conversationId),
    ).toMatchObject({
      state: "failed",
      attempts: 1,
      retryable: false,
      lastError: "Enable Letta before forgetting persisted memory.",
    });
    expect(
      (await db.pendingConversationDeletions.get(conversationId))
        ?.nextAttemptAt,
    ).toBeUndefined();

    // A fresh background runtime represents a renderer reload. Permanent
    // failures remain hidden and visible to the UI, but are not invoked again.
    const reloadedRuntime = installDeletionRuntime(async () => ({
      success: true,
      data: { deleted: true },
    }));
    await expect(replayPendingConversationDeletions()).resolves.toEqual([
      expect.objectContaining({
        conversationId,
        deleted: false,
        skipped: true,
        retryable: false,
        error: expect.objectContaining({
          message: "Enable Letta before forgetting persisted memory.",
        }),
      }),
    ]);
    expect(reloadedRuntime.quiesceConversation).not.toHaveBeenCalled();
    expect(reloadedRuntime.deleteConversation).not.toHaveBeenCalled();

    // The explicit retry API intentionally overrides automatic retry policy.
    await replayPendingConversationDeletion(conversationId);
    expect(reloadedRuntime.deleteConversation).toHaveBeenCalledOnce();
    expect(await db.conversations.get(conversationId)).toBeUndefined();
  });

  it("releases a late second replay lease after the first deletes the intent", async () => {
    await seedBase();
    await prepareConversationDeletionIntent(conversationId, true);
    const firstLeaseAcquired = deferred<void>();
    const secondQuiesceEntered = deferred<void>();
    const allowSecondLease = deferred<void>();
    let quiesceCalls = 0;
    const resumeConversation = vi.fn(async () => ({
      success: true as const,
      data: { resumed: true },
    }));
    const deleteConversation = vi.fn(async () => {
      await secondQuiesceEntered.promise;
      return {
        success: true as const,
        data: { deleted: true },
      };
    });
    vi.stubGlobal("window", {
      localAI: {
        quiesceConversation: vi.fn(async () => {
          quiesceCalls += 1;
          if (quiesceCalls === 1) {
            firstLeaseAcquired.resolve();
            return {
              success: true as const,
              data: { quiesced: true as const, leaseToken: "lease-first" },
            };
          }
          secondQuiesceEntered.resolve();
          await allowSecondLease.promise;
          return {
            success: true as const,
            data: { quiesced: true as const, leaseToken: "lease-second" },
          };
        }),
        resumeConversation,
        deleteConversation,
        getTurnRuntimeState: vi.fn(),
        acknowledgeTurnPersistence: vi.fn(),
      },
    });

    const firstReplay = replayPendingConversationDeletion(conversationId);
    await firstLeaseAcquired.promise;
    const secondReplay = replayPendingConversationDeletion(conversationId);
    await secondQuiesceEntered.promise;
    await firstReplay;
    allowSecondLease.resolve();
    await secondReplay;

    expect(deleteConversation).toHaveBeenCalledOnce();
    expect(resumeConversation).toHaveBeenCalledWith({
      conversationId,
      leaseToken: "lease-second",
    });
    expect(
      await db.pendingConversationDeletions.get(conversationId),
    ).toBeUndefined();
  });

  it("lets one replay finish when a concurrent replay hits a lease conflict", async () => {
    await seedBase();
    await prepareConversationDeletionIntent(conversationId, true);
    const firstLeaseAcquired = deferred<void>();
    const allowFirstDelete = deferred<void>();
    let quiesceCalls = 0;
    vi.stubGlobal("window", {
      localAI: {
        quiesceConversation: vi.fn(async () => {
          quiesceCalls += 1;
          if (quiesceCalls === 1) {
            firstLeaseAcquired.resolve();
            return {
              success: true as const,
              data: { quiesced: true as const, leaseToken: "lease-first" },
            };
          }
          return {
            success: false as const,
            error: { message: "lease conflict" },
          };
        }),
        resumeConversation: vi.fn(async () => ({
          success: true as const,
          data: { resumed: true },
        })),
        deleteConversation: vi.fn(async () => {
          await allowFirstDelete.promise;
          return {
            success: true as const,
            data: { deleted: true },
          };
        }),
        getTurnRuntimeState: vi.fn(),
        acknowledgeTurnPersistence: vi.fn(),
      },
    });

    const firstReplay = replayPendingConversationDeletion(conversationId);
    await firstLeaseAcquired.promise;
    const secondReplay = replayPendingConversationDeletion(conversationId);
    await expect(secondReplay).rejects.toThrow("lease conflict");
    expect(
      await db.pendingConversationDeletions.get(conversationId),
    ).toMatchObject({
      state: "failed",
      lastError: "lease conflict",
    });
    allowFirstDelete.resolve();
    await firstReplay;

    expect(await db.conversations.get(conversationId)).toBeUndefined();
    expect(
      await db.pendingConversationDeletions.get(conversationId),
    ).toBeUndefined();
  });

  it("fences a new turn while deletion intent is pending", async () => {
    await seedBase();
    await prepareConversationDeletionIntent(conversationId, true);

    await expect(
      stagePendingTurn(
        conversationId,
        [{ id: "user-1", role: "user", content: "hello" }],
        [
          { id: "user-1", role: "user", content: "hello" },
          { id: "user-2", role: "user", content: "must not send" },
          { id: "assistant-2", role: "assistant", content: "" },
        ],
        {
          turnId: "turn-1",
          requestId: "request-1",
          revision: 0,
          providerId: "codex-cli",
          operation: "append",
          userMessageId: "user-2",
          assistantMessageId: "assistant-2",
        },
      ),
    ).rejects.toThrow("deletion is pending");
    expect(await db.messages.get("user-2")).toBeUndefined();
  });

  it("atomically clears data and intent only after main confirms success", async () => {
    await seedBase();
    const runtime = installDeletionRuntime(async () => ({
      success: true,
      data: { deleted: true },
    }));

    await deleteConversationWithRuntime(conversationId);

    expect(runtime.deleteConversation).toHaveBeenCalledWith({
      conversationId,
      forgetConversationMemory: true,
      leaseToken: "lease-delete",
    });
    expect(await db.conversations.get(conversationId)).toBeUndefined();
    expect(await db.messages.get("user-1")).toBeUndefined();
    expect(
      await db.pendingConversationDeletions.get(conversationId),
    ).toBeUndefined();
  });
});
