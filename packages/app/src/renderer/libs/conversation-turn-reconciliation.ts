import type { LocalAITurnRuntimeState } from "@/shared/types/local-ai";
import { DEFAULT_LOCAL_AI_MODEL_ID } from "./local-ai";
import {
  planTurnReconciliation,
  type TurnReconciliationAction,
} from "./conversation-turn-reconciliation-plan";
import { db, type Message, type PendingTurnJournal } from "./db/database";
import { completeConversationTurnPersistence } from "./conversation-turn-persistence";

export interface TurnReconciliationResult {
  turnId: string;
  action: TurnReconciliationAction | "missing" | "error";
  locallySettled: boolean;
  retry: boolean;
  ackPending: boolean;
  error?: Error;
}

export interface LiveAssistantSnapshot {
  content: string;
  senderId?: string;
  mentions?: string[];
  reactions?: Message["reactions"];
  parts?: unknown[];
  experimental_attachments?: Message["experimental_attachments"];
}

function locallySettledResult(
  result: Omit<TurnReconciliationResult, "locallySettled">,
): TurnReconciliationResult {
  completeConversationTurnPersistence(result.turnId);
  return { ...result, locallySettled: true };
}

async function restoreJournalRows(
  journal: PendingTurnJournal,
  keepJournal: boolean,
  revision?: number,
): Promise<void> {
  await db.transaction(
    "rw",
    [db.messages, db.conversations, db.pendingTurns],
    async () => {
      const currentJournal = await db.pendingTurns.get(journal.turnId);
      if (!currentJournal) return;
      const touchedIds = [
        ...currentJournal.insertedMessageIds,
        ...currentJournal.previousMessages.map((message) => message.id),
      ];
      const current = await db.messages.bulkGet(touchedIds);
      const stillOwnedIds = new Set(
        current
          .filter(
            (message): message is Message =>
              message?.conversationId === journal.conversationId &&
              message.turnId === journal.turnId &&
              message.status !== "completed",
          )
          .map((message) => message.id),
      );
      const insertedToDelete = currentJournal.insertedMessageIds.filter(
        (messageId) => stillOwnedIds.has(messageId),
      );
      if (insertedToDelete.length > 0) {
        await db.messages.bulkDelete(insertedToDelete);
      }
      const previousToRestore = currentJournal.previousMessages.filter(
        (message) => stillOwnedIds.has(message.id),
      );
      if (previousToRestore.length > 0) {
        await db.messages.bulkPut(previousToRestore);
      }
      const conversation = await db.conversations.get(journal.conversationId);
      if (conversation) {
        const messageCount = await db.messages
          .where("conversationId")
          .equals(journal.conversationId)
          .count();
        await db.conversations.update(journal.conversationId, {
          ...(revision === undefined ? {} : { activeRevision: revision }),
          updatedAt: new Date(),
          metadata: {
            ...(conversation.metadata || {}),
            messageCount,
          },
        });
      }
      if (keepJournal) {
        await db.pendingTurns.update(journal.turnId, {
          state: "committed-awaiting-ack",
          updatedAt: new Date(),
        });
      } else {
        await db.pendingTurns.delete(journal.turnId);
      }
    },
  );
}

async function finalizeCompletedTurn(
  journal: PendingTurnJournal,
  runtime: LocalAITurnRuntimeState,
  liveAssistant?: LiveAssistantSnapshot,
): Promise<void> {
  await db.transaction(
    "rw",
    [db.messages, db.conversations, db.pendingTurns],
    async () => {
      const currentJournal = await db.pendingTurns.get(journal.turnId);
      if (!currentJournal) return;
      if (currentJournal.state === "committed-awaiting-ack") return;
      const conversation = await db.conversations.get(journal.conversationId);
      if (!conversation) {
        throw new Error("Conversation disappeared during turn recovery.");
      }
      const desired = await db.messages.bulkGet(
        currentJournal.desiredMessageIds,
      );
      if (
        desired.some(
          (message) =>
            !message || message.conversationId !== journal.conversationId,
        )
      ) {
        throw new Error("The staged transcript is incomplete.");
      }
      const desiredMessages = desired as Message[];
      const desiredIds = new Set(currentJournal.desiredMessageIds);
      const removedIds = (
        await db.messages
          .where("conversationId")
          .equals(journal.conversationId)
          .toArray()
      )
        .filter((message) => !desiredIds.has(message.id))
        .map((message) => message.id);
      if (removedIds.length > 0) {
        await db.messages.bulkDelete(removedIds);
      }
      await db.messages.bulkPut(
        desiredMessages.map((message) => {
          if (message.id === currentJournal.assistantMessageId) {
            return {
              ...message,
              ...(liveAssistant ?? {}),
              content: liveAssistant?.content ?? runtime.assistantText ?? "",
              turnId: journal.turnId,
              revision: runtime.revision,
              providerId: runtime.providerId,
              modelId: runtime.modelId,
              status: "completed" as const,
              finishReason: runtime.finishReason ?? "stop",
            };
          }
          if (message.id === currentJournal.userMessageId) {
            return {
              ...message,
              turnId: journal.turnId,
              revision: runtime.revision,
              providerId: runtime.providerId,
              modelId: runtime.modelId,
              status: "completed" as const,
              finishReason: undefined,
            };
          }
          return message;
        }),
      );
      const modelId = runtime.modelId ?? DEFAULT_LOCAL_AI_MODEL_ID;
      await db.conversations.update(journal.conversationId, {
        activeRevision: runtime.revision,
        activeProviderId: runtime.providerId,
        activeModelId: modelId,
        modelId: `${runtime.providerId}:${modelId}`,
        updatedAt: new Date(),
        metadata: {
          ...(conversation.metadata || {}),
          messageCount: desiredMessages.length,
        },
      });
      await db.pendingTurns.update(journal.turnId, {
        state: "committed-awaiting-ack",
        updatedAt: new Date(),
      });
    },
  );
}

async function finalizeFailedTurn(
  journal: PendingTurnJournal,
  runtime: LocalAITurnRuntimeState,
  liveAssistant?: LiveAssistantSnapshot,
): Promise<void> {
  await db.transaction(
    "rw",
    [db.messages, db.conversations, db.pendingTurns],
    async () => {
      const currentJournal = await db.pendingTurns.get(journal.turnId);
      if (!currentJournal) return;
      if (currentJournal.state === "committed-awaiting-ack") return;
      const assistantStatus =
        runtime.status === "aborted"
          ? ("aborted" as const)
          : ("failed" as const);
      await db.messages
        .where("[conversationId+turnId]")
        .equals([journal.conversationId, journal.turnId])
        .modify((message) => {
          message.revision = runtime.revision;
          message.providerId = runtime.providerId;
          message.modelId = runtime.modelId;
          if (message.id === journal.assistantMessageId) {
            if (liveAssistant) {
              message.content = liveAssistant.content;
              message.senderId = liveAssistant.senderId ?? message.senderId;
              message.mentions = liveAssistant.mentions ?? message.mentions;
              message.reactions = liveAssistant.reactions ?? message.reactions;
              message.parts = liveAssistant.parts;
              message.experimental_attachments =
                liveAssistant.experimental_attachments;
            }
            message.status = assistantStatus;
            message.finishReason =
              runtime.finishReason ?? runtime.error ?? runtime.status;
          } else {
            message.status = "completed";
            message.finishReason = undefined;
          }
        });
      const conversation = await db.conversations.get(journal.conversationId);
      if (conversation) {
        await db.conversations.update(journal.conversationId, {
          activeRevision: runtime.revision,
          updatedAt: new Date(),
          metadata: {
            ...(conversation.metadata || {}),
            messageCount: await db.messages
              .where("conversationId")
              .equals(journal.conversationId)
              .count(),
          },
        });
      }
      await db.pendingTurns.update(journal.turnId, {
        state: "committed-awaiting-ack",
        updatedAt: new Date(),
      });
    },
  );
}

async function acknowledgeTerminalTurn(
  journal: PendingTurnJournal,
): Promise<boolean> {
  const result = await window.localAI.acknowledgeTurnPersistence({
    conversationId: journal.conversationId,
    turnId: journal.turnId,
  });
  if (!result.success || !result.data?.acknowledged) return false;
  await db.transaction("rw", db.pendingTurns, async () => {
    const current = await db.pendingTurns.get(journal.turnId);
    if (current?.state === "committed-awaiting-ack") {
      await db.pendingTurns.delete(journal.turnId);
    }
  });
  return true;
}

export async function reconcilePendingTurn(
  turnId: string,
  options: {
    stableNotFound?: boolean;
    now?: number;
    liveAssistant?: LiveAssistantSnapshot;
    preferLiveGrace?: boolean;
  } = {},
): Promise<TurnReconciliationResult> {
  const journal = await db.pendingTurns.get(turnId);
  if (!journal) {
    return locallySettledResult({
      turnId,
      action: "missing",
      retry: false,
      ackPending: false,
    });
  }
  const result = await window.localAI.getTurnRuntimeState({
    conversationId: journal.conversationId,
    turnId,
  });
  if (!result.success) {
    throw new Error(
      result.error?.message || "Could not read the local AI turn outbox.",
    );
  }
  const runtime = result.data ?? null;
  const action = planTurnReconciliation(journal, runtime, {
    now: options.now ?? Date.now(),
    stableNotFound: options.stableNotFound ?? false,
    preferLiveGrace: options.preferLiveGrace,
    liveAvailable: options.liveAssistant !== undefined,
  });

  if (action === "defer" || action === "pending") {
    return {
      turnId,
      action,
      locallySettled: false,
      retry: true,
      ackPending: false,
    };
  }
  if (action === "rollback") {
    await restoreJournalRows(journal, false);
    return locallySettledResult({
      turnId,
      action,
      retry: false,
      ackPending: false,
    });
  }
  if (action === "cleanup") {
    await db.pendingTurns.delete(turnId);
    return locallySettledResult({
      turnId,
      action,
      retry: false,
      ackPending: false,
    });
  }
  if (!runtime) {
    throw new Error("Terminal turn state disappeared during reconciliation.");
  }
  if (action === "complete") {
    await finalizeCompletedTurn(journal, runtime, options.liveAssistant);
  } else if (action === "restore") {
    await restoreJournalRows(journal, true, runtime.revision);
  } else {
    await finalizeFailedTurn(journal, runtime, options.liveAssistant);
  }
  const acknowledged = await acknowledgeTerminalTurn(journal).catch(
    () => false,
  );
  return locallySettledResult({
    turnId,
    action,
    retry: !acknowledged,
    ackPending: !acknowledged,
  });
}

export async function reconcilePendingTurns(
  options: {
    conversationId?: string;
    stableNotFound?: boolean;
    preferLiveGrace?: boolean;
    excludeTurnIds?: string[];
  } = {},
): Promise<TurnReconciliationResult[]> {
  const journals = options.conversationId
    ? await db.pendingTurns
        .where("conversationId")
        .equals(options.conversationId)
        .toArray()
    : await db.pendingTurns.toArray();
  const excluded = new Set(options.excludeTurnIds ?? []);
  return Promise.all(
    journals
      .filter((journal) => !excluded.has(journal.turnId))
      .map(async (journal) => {
        try {
          return await reconcilePendingTurn(journal.turnId, {
            stableNotFound: options.stableNotFound,
            preferLiveGrace: options.preferLiveGrace,
          });
        } catch (error) {
          return {
            turnId: journal.turnId,
            action: "error" as const,
            locallySettled: false,
            retry: true,
            ackPending: false,
            error:
              error instanceof Error
                ? error
                : new Error("Pending turn reconciliation failed."),
          };
        }
      }),
  );
}
