import type { LocalAIMessage } from "@/shared/types/local-ai";
import {
  branchFromMessage,
  deleteConversation as deleteConversationFromDexie,
  updateConversation,
} from "./db/hooks";
import { db } from "./db/database";
import {
  commitThenFinalize,
  prepareThenCommit,
} from "./lifecycle-compensation";
import { boundBootstrapMessages } from "./local-ai-request";

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

export async function branchConversationWithRuntime(
  sourceConversationId: string,
  upToMessageIndex: number,
): Promise<string> {
  const sourceMessages = await db.messages
    .where("conversationId")
    .equals(sourceConversationId)
    .sortBy("createdAt");
  if (upToMessageIndex < 0 || upToMessageIndex >= sourceMessages.length) {
    throw new Error("Invalid message index for branching");
  }

  const messagesToCopy = sourceMessages.slice(0, upToMessageIndex + 1);
  const targetConversationId = crypto.randomUUID();
  return prepareThenCommit(
    async () => {
      const runtimeResult = await window.localAI.branchConversation({
        sourceConversationId,
        targetConversationId,
        throughMessageId: messagesToCopy.at(-1)?.id,
        bootstrapMessages: boundBootstrapMessages(
          toRuntimeMessages(messagesToCopy),
        ),
      });
      if (!runtimeResult.success || !runtimeResult.data) {
        throw new Error(
          runtimeResult.error?.message ||
            "Could not create conversation branch.",
        );
      }
      return runtimeResult.data;
    },
    async (runtimeState) => {
      try {
        const branchId = await branchFromMessage(
          sourceConversationId,
          upToMessageIndex,
          targetConversationId,
        );
        if (runtimeState) {
          await updateConversation(branchId, {
            activeRevision: runtimeState.revision,
          });
        }
        return branchId;
      } catch (error) {
        await deleteConversationFromDexie(targetConversationId).catch(
          () => undefined,
        );
        throw error;
      }
    },
    async () => {
      // Cross-process state cannot share an IndexedDB transaction. Remove the
      // prepared main-process branch if the local transcript copy fails.
      await window.localAI.deleteConversation({
        conversationId: targetConversationId,
        forgetConversationMemory: true,
      });
    },
  );
}

export async function deleteConversationWithRuntime(
  conversationId: string,
  forgetConversationMemory = true,
): Promise<void> {
  const [conversation, messages] = await Promise.all([
    db.conversations.get(conversationId),
    db.messages.where("conversationId").equals(conversationId).toArray(),
  ]);

  await commitThenFinalize(
    async () => {
      await deleteConversationFromDexie(conversationId);
      return { conversation, messages };
    },
    async () => {
      const runtimeResult = await window.localAI.deleteConversation({
        conversationId,
        forgetConversationMemory,
      });
      if (!runtimeResult.success) {
        throw new Error(
          runtimeResult.error?.message ||
            "Could not delete conversation runtime.",
        );
      }
    },
    async (snapshot) => {
      if (!snapshot.conversation) return;
      await db.transaction("rw", [db.conversations, db.messages], async () => {
        await db.conversations.put(snapshot.conversation!);
        if (snapshot.messages.length > 0) {
          await db.messages.bulkPut(snapshot.messages);
        }
      });
    },
  );
}
