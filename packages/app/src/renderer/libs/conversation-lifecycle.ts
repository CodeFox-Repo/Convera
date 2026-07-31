import type { LocalAIMessage } from "@/shared/types/local-ai";
import { branchFromMessage } from "./db/hooks";
import { db } from "./db/database";
import { boundBootstrapMessages } from "./local-ai-request";
import {
  completeConversationTurnPersistence,
  getPendingConversationTurnIds,
  waitForConversationTurnPersistence,
} from "./conversation-turn-persistence";
import { reconcilePendingTurns } from "./conversation-turn-reconciliation";
import { LIVE_FINALIZER_GRACE_MS } from "./conversation-turn-reconciliation-plan";

function toRuntimeMessages(
  messages: Array<{ id: string; role: string; content: string }>,
): LocalAIMessage[] {
  return messages
    .filter(
      (
        message,
      ): message is {
        id: string;
        role: "system" | "user" | "assistant";
        content: string;
      } =>
        message.role === "system" ||
        message.role === "user" ||
        message.role === "assistant",
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    }));
}

function localAIResultError(
  error:
    | {
        message?: string;
        code?: string;
        retryable?: boolean;
      }
    | undefined,
  fallbackMessage: string,
): Error {
  return Object.assign(new Error(error?.message || fallbackMessage), {
    ...(error?.code ? { code: error.code } : {}),
    ...(typeof error?.retryable === "boolean"
      ? { retryable: error.retryable }
      : {}),
  });
}

function isRetryableDeletionError(error: unknown): boolean {
  return !(
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    error.retryable === false
  );
}

async function waitForPersistedPendingTurns(
  conversationId: string,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hasPendingTurn = (
      await db.messages.where("conversationId").equals(conversationId).toArray()
    ).some((message) => message.status === "pending");
    if (!hasPendingTurn) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  const stillPending = (
    await db.messages.where("conversationId").equals(conversationId).toArray()
  ).some((message) => message.status === "pending");
  if (stillPending) {
    throw new Error(
      "Timed out waiting for the pending conversation turn to persist.",
    );
  }
}

async function reconcileBeforeConversationDelete(
  conversationId: string,
): Promise<void> {
  const deadline = Date.now() + LIVE_FINALIZER_GRACE_MS;
  while (true) {
    const results = await reconcilePendingTurns({
      conversationId,
      stableNotFound: true,
      preferLiveGrace: Date.now() < deadline,
    });
    const unresolved = results.filter((result) => !result.locallySettled);
    if (unresolved.length === 0) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `Conversation turn ${unresolved[0].turnId} is still active after quiescence.`,
      );
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }
}

export async function branchConversationWithRuntime(
  sourceConversationId: string,
  upToMessageIndex: number,
): Promise<string> {
  const [sourceMessages, sourceDeletion] = await Promise.all([
    db.messages
      .where("conversationId")
      .equals(sourceConversationId)
      .sortBy("createdAt"),
    db.pendingConversationDeletions.get(sourceConversationId),
  ]);
  if (sourceDeletion) {
    throw new Error("Cannot branch a conversation pending deletion.");
  }
  if (upToMessageIndex < 0 || upToMessageIndex >= sourceMessages.length) {
    throw new Error("Invalid message index for branching");
  }

  const messagesToCopy = sourceMessages.slice(0, upToMessageIndex + 1);
  const targetConversationId = crypto.randomUUID();
  try {
    const published = await withConversationLifecycleLock(
      targetConversationId,
      false,
      async () => {
        await prepareConversationCleanupIntent(targetConversationId);
        const runtimeResult = await window.localAI.branchConversation({
          sourceConversationId,
          targetConversationId,
          throughMessageId: messagesToCopy.at(-1)?.id,
          bootstrapMessages: boundBootstrapMessages(
            toRuntimeMessages(messagesToCopy),
          ),
        });
        if (!runtimeResult.success || !runtimeResult.data) {
          throw localAIResultError(
            runtimeResult.error,
            "Could not create conversation branch.",
          );
        }
        return branchFromMessage(
          sourceConversationId,
          upToMessageIndex,
          targetConversationId,
          runtimeResult.data.revision,
          true,
          messagesToCopy,
        );
      },
    );
    if (!published.acquired || !published.value) {
      throw new Error("Could not acquire the conversation branch lock.");
    }
    return published.value;
  } catch (error) {
    // A Web Lock prevents another renderer from replaying this cleanup while
    // the branch is live, and is automatically released if this renderer exits.
    await replayPendingConversationDeletion(targetConversationId).catch(
      () => undefined,
    );
    throw error;
  }
}

type ConversationLifecycleLockResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

async function withConversationLifecycleLock<T>(
  conversationId: string,
  ifAvailable: boolean,
  operation: () => Promise<T>,
): Promise<ConversationLifecycleLockResult<T>> {
  const locks = globalThis.navigator?.locks;
  if (!locks) {
    return { acquired: true, value: await operation() };
  }
  return locks.request(
    `convera:conversation-lifecycle:${conversationId}`,
    { mode: "exclusive", ifAvailable },
    async (lock) => {
      if (!lock) return { acquired: false } as const;
      return {
        acquired: true,
        value: await operation(),
      } as const;
    },
  );
}

export async function prepareConversationCleanupIntent(
  conversationId: string,
): Promise<void> {
  await db.transaction("rw", db.pendingConversationDeletions, async () => {
    const existing = await db.pendingConversationDeletions.get(conversationId);
    const now = new Date();
    await db.pendingConversationDeletions.put({
      conversationId,
      forgetConversationMemory: true,
      operation: "branch-cleanup",
      state: "pending",
      attempts: existing?.attempts ?? 0,
      lastError: existing?.lastError,
      retryable: existing?.retryable,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastAttemptAt: existing?.lastAttemptAt,
      nextAttemptAt: existing?.nextAttemptAt,
    });
  });
}

export async function deleteConversationWithRuntime(
  conversationId: string,
  forgetConversationMemory = true,
): Promise<void> {
  // Persist the user's deletion decision before crossing IPC. A renderer
  // crash, lease conflict, or response loss leaves a hidden, retryable intent
  // rather than making the conversation visible/sendable again.
  await prepareConversationDeletionIntent(
    conversationId,
    forgetConversationMemory,
  );
  await executePendingConversationDeletion(conversationId);
}

async function resumeConversationLease(
  conversationId: string,
  leaseToken: string,
): Promise<void> {
  await window.localAI
    .resumeConversation({ conversationId, leaseToken })
    .catch(() => {
      // Runtime delete releases its lease even when finalization fails.
    });
}

async function quiesceAndReconcileConversation(
  conversationId: string,
): Promise<string> {
  let leaseToken: string | undefined;
  try {
    const runtimeResult =
      await window.localAI.quiesceConversation(conversationId);
    if (!runtimeResult.success || !runtimeResult.data?.quiesced) {
      throw localAIResultError(
        runtimeResult.error,
        "Could not quiesce the conversation runtime.",
      );
    }
    leaseToken = runtimeResult.data.leaseToken;
    const localTurnIds = getPendingConversationTurnIds(conversationId);
    await reconcileBeforeConversationDelete(conversationId);
    for (const turnId of localTurnIds) {
      completeConversationTurnPersistence(turnId);
    }
    await waitForConversationTurnPersistence(conversationId);
    await waitForPersistedPendingTurns(conversationId);
    return leaseToken;
  } catch (error) {
    if (leaseToken) {
      await resumeConversationLease(conversationId, leaseToken);
    }
    throw error;
  }
}

export async function prepareConversationDeletionIntent(
  conversationId: string,
  forgetConversationMemory: boolean,
): Promise<void> {
  await db.transaction(
    "rw",
    [db.conversations, db.pendingConversationDeletions],
    async () => {
      const conversation = await db.conversations.get(conversationId);
      const existing =
        await db.pendingConversationDeletions.get(conversationId);
      if (!conversation && !existing) {
        return;
      }
      const now = new Date();
      await db.pendingConversationDeletions.put({
        conversationId,
        forgetConversationMemory:
          existing?.forgetConversationMemory || forgetConversationMemory,
        operation: "deletion",
        state: "pending",
        attempts: existing?.attempts ?? 0,
        lastError: existing?.lastError,
        retryable: existing?.retryable,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        lastAttemptAt: existing?.lastAttemptAt,
        nextAttemptAt: existing?.nextAttemptAt,
      });
    },
  );
}

async function markDeletionAttempt(conversationId: string): Promise<void> {
  await db.transaction("rw", db.pendingConversationDeletions, async () => {
    const intent = await db.pendingConversationDeletions.get(conversationId);
    if (!intent) {
      throw new Error("Conversation deletion intent is missing.");
    }
    const now = new Date();
    await db.pendingConversationDeletions.update(conversationId, {
      state: "deleting",
      attempts: intent.attempts + 1,
      lastError: undefined,
      retryable: undefined,
      updatedAt: now,
      lastAttemptAt: now,
      nextAttemptAt: undefined,
    });
  });
}

async function recordDeletionFailure(
  conversationId: string,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error ? error.message : "Conversation deletion failed.";
  const retryable = isRetryableDeletionError(error);
  await db
    .transaction("rw", db.pendingConversationDeletions, async () => {
      const intent = await db.pendingConversationDeletions.get(conversationId);
      if (!intent) return;
      const retryDelayMs = Math.min(
        60_000,
        1_000 * 2 ** Math.min(Math.max(intent.attempts - 1, 0), 6),
      );
      const updatedAt = new Date();
      await db.pendingConversationDeletions.update(conversationId, {
        state: "failed",
        lastError: message,
        retryable,
        updatedAt,
        nextAttemptAt: retryable
          ? new Date(updatedAt.getTime() + retryDelayMs)
          : undefined,
      });
    })
    .catch(() => undefined);
}

async function physicallyDeleteConversation(
  conversationId: string,
): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.conversations,
      db.messages,
      db.pendingTurns,
      db.pendingConversationDeletions,
    ],
    async () => {
      await db.messages.where("conversationId").equals(conversationId).delete();
      await db.pendingTurns
        .where("conversationId")
        .equals(conversationId)
        .delete();
      await db.conversations.delete(conversationId);
      await db.pendingConversationDeletions.delete(conversationId);
    },
  );
}

async function executePendingConversationDeletion(
  conversationId: string,
  existingLeaseToken?: string,
): Promise<void> {
  let leaseToken = existingLeaseToken;
  try {
    await markDeletionAttempt(conversationId);
    if (!leaseToken) {
      leaseToken = await quiesceAndReconcileConversation(conversationId);
    }
    const intent = await db.pendingConversationDeletions.get(conversationId);
    if (!intent) {
      if (leaseToken) {
        await resumeConversationLease(conversationId, leaseToken);
      }
      return;
    }
    const runtimeResult = await window.localAI.deleteConversation({
      conversationId,
      forgetConversationMemory: intent.forgetConversationMemory,
      leaseToken,
    });
    if (!runtimeResult.success) {
      throw localAIResultError(
        runtimeResult.error,
        "Could not delete conversation runtime.",
      );
    }
    await physicallyDeleteConversation(conversationId);
  } catch (error) {
    await recordDeletionFailure(conversationId, error);
    if (leaseToken) {
      await resumeConversationLease(conversationId, leaseToken);
    }
    throw error;
  }
}

export async function replayPendingConversationDeletion(
  conversationId: string,
): Promise<boolean> {
  const intent = await db.pendingConversationDeletions.get(conversationId);
  if (!intent) return false;
  if (intent.operation !== "branch-cleanup") {
    await executePendingConversationDeletion(conversationId);
    return true;
  }
  const replay = await withConversationLifecycleLock(conversationId, true, () =>
    executePendingConversationDeletion(conversationId),
  );
  return replay.acquired;
}

export async function retryPendingConversationDeletion(
  conversationId: string,
): Promise<void> {
  await replayPendingConversationDeletion(conversationId);
}

export interface ConversationDeletionReplayResult {
  conversationId: string;
  deleted: boolean;
  skipped?: boolean;
  retryable?: boolean;
  error?: Error;
}

export async function replayPendingConversationDeletions(): Promise<
  ConversationDeletionReplayResult[]
> {
  const intents = await db.pendingConversationDeletions.toArray();
  const now = Date.now();
  return Promise.all(
    intents.map(async (intent) => {
      if (intent.state === "failed" && intent.retryable === false) {
        return {
          conversationId: intent.conversationId,
          deleted: false,
          skipped: true,
          retryable: false,
          error: Object.assign(
            new Error(
              intent.lastError || "Conversation deletion needs attention.",
            ),
            { retryable: false },
          ),
        };
      }
      if (
        intent.state === "failed" &&
        intent.nextAttemptAt &&
        intent.nextAttemptAt.getTime() > now
      ) {
        return {
          conversationId: intent.conversationId,
          deleted: false,
          skipped: true,
          retryable: true,
        };
      }
      try {
        const deleted = await replayPendingConversationDeletion(
          intent.conversationId,
        );
        return {
          conversationId: intent.conversationId,
          deleted,
          skipped: !deleted,
        };
      } catch (error) {
        return {
          conversationId: intent.conversationId,
          deleted: false,
          retryable: isRetryableDeletionError(error),
          error:
            error instanceof Error
              ? error
              : new Error("Conversation deletion replay failed."),
        };
      }
    }),
  );
}
