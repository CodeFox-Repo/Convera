/**
 * Chat History Store - Dexie Version
 *
 * Fully local storage, no cloud sync
 * Uses Dexie liveQuery for real-time data updates and multi-window sync
 */

import type { Message } from "@/renderer/types/chat";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  useConversations,
  useMessages,
  createConversation,
  updateConversation,
  addMessage,
  updateMessages,
  type Conversation,
  db,
} from "../db";
import {
  deleteConversationWithRuntime,
  retryPendingConversationDeletion,
} from "../conversation-lifecycle";
import { useSelectionStore } from "../db/ui-state";

// Re-export types for backward compatibility
export interface ConversationData {
  id: string;
  title: string | null;
  agentId: string | null;
  modelId: string | null;
  activeRevision: number;
  activeProviderId: string | null;
  activeModelId: string | null;
  systemPrompt: string | null;
  metadata: {
    settings?: Record<string, unknown>;
    tags?: string[];
    archived?: boolean;
    starred?: boolean;
    messageCount?: number;
  } | null;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

function parseModelSelection(modelId?: string) {
  const separatorIndex = modelId?.indexOf(":") ?? -1;
  return {
    providerId:
      modelId && separatorIndex >= 0 ? modelId.slice(0, separatorIndex) : null,
    activeModelId:
      modelId && separatorIndex >= 0 ? modelId.slice(separatorIndex + 1) : null,
  };
}

const reportedDeletionErrors = new Map<string, string>();

function deletionToastId(conversationId: string): string {
  return `conversation-deletion:${conversationId}`;
}

export function notifyDeferredDeletion(
  conversationId: string,
  error: unknown,
): void {
  const message =
    error instanceof Error ? error.message : "Conversation deletion failed.";
  if (reportedDeletionErrors.get(conversationId) === message) return;
  reportedDeletionErrors.set(conversationId, message);
  const retryable = !(
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    error.retryable === false
  );
  toast.error("Conversation deletion is pending", {
    id: deletionToastId(conversationId),
    description: `${message} Convera will retry automatically.`,
    ...(retryable
      ? {}
      : {
          description: message,
          duration: Infinity,
          action: {
            label: "Retry",
            onClick: () => {
              reportedDeletionErrors.delete(conversationId);
              void retryPendingConversationDeletion(conversationId)
                .then(() => {
                  clearDeletionFailureNotification(conversationId);
                  toast.success("Conversation deleted");
                })
                .catch((retryError) => {
                  notifyDeferredDeletion(conversationId, retryError);
                });
            },
          },
        }),
  });
}

export function clearDeletionFailureNotification(conversationId: string): void {
  reportedDeletionErrors.delete(conversationId);
  toast.dismiss(deletionToastId(conversationId));
}

// ==================== Hooks ====================

/**
 * Main chat history hook
 * Replaces the old useChatHistoryStore
 */
export function useChatHistoryStore() {
  const conversations = useConversations();
  const { currentConversationId, setCurrentConversation } = useSelectionStore();
  const messages = useMessages(currentConversationId);

  // Convert to old format ConversationData (with messages)
  const conversationsWithMessages: ConversationData[] = (
    conversations || []
  ).map((conv) => ({
    id: conv.id,
    title: conv.title,
    agentId: conv.agentId,
    modelId: conv.modelId,
    activeRevision: conv.activeRevision,
    activeProviderId: conv.activeProviderId,
    activeModelId: conv.activeModelId,
    systemPrompt: conv.systemPrompt,
    metadata: conv.metadata as ConversationData["metadata"],
    messages: [], // Messages are queried separately
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
  }));

  return {
    // State
    conversations: conversationsWithMessages,
    currentConversationId,
    currentMessages: messages || [],
    loading: conversations === undefined,
    error: null,
    refreshing: false,

    // Actions
    setCurrentConversation,

    createConversation: async (options?: {
      title?: string;
      agentId?: string;
      modelId?: string;
      initialMessage?: {
        role: "user" | "assistant" | "system";
        content: string;
      };
    }) => {
      const selection = parseModelSelection(options?.modelId);
      const id = await createConversation({
        title: options?.title ?? null,
        agentId: options?.agentId ?? null,
        modelId: options?.modelId ?? null,
        activeRevision: 0,
        activeProviderId: selection.providerId,
        activeModelId: selection.activeModelId,
        systemPrompt: null,
        metadata: null,
      });

      if (options?.initialMessage) {
        await addMessage(id, {
          role: options.initialMessage.role,
          content: options.initialMessage.content,
        });
      }

      setCurrentConversation(id);
      return id;
    },

    updateConversation: async (
      id: string,
      updates: Partial<Omit<Conversation, "id" | "createdAt">>,
    ) => {
      await updateConversation(id, updates);
    },

    deleteConversation: async (id: string) => {
      try {
        await deleteConversationWithRuntime(id, true);
      } catch (error) {
        if (await db.pendingConversationDeletions.get(id)) {
          notifyDeferredDeletion(id, error);
        }
        throw error;
      } finally {
        const [intent, conversation] = await Promise.all([
          db.pendingConversationDeletions.get(id),
          db.conversations.get(id),
        ]);
        if (currentConversationId === id && (intent || !conversation)) {
          setCurrentConversation(null);
        }
        if (!intent) clearDeletionFailureNotification(id);
      }
    },

    // Save messages to current conversation
    saveMessages: async (msgs: Message[]) => {
      if (!currentConversationId) return;

      await updateMessages(
        currentConversationId,
        msgs.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system" | "tool",
          content:
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
          senderId: m.senderId,
          mentions: m.mentions,
          // updateMessages rewrites every row, so reactions must ride along or
          // a save would silently drop them.
          reactions: m.reactions,
          parts: m.parts,
          experimental_attachments: m.experimental_attachments?.map((a) => ({
            url: a.url,
            name: a.name ?? "",
            contentType: a.contentType ?? "",
          })),
        })),
      );
    },

    // Add single message
    addMessage: async (message: Omit<Message, "id">) => {
      if (!currentConversationId) return;

      await addMessage(currentConversationId, {
        role: message.role as "user" | "assistant" | "system" | "tool",
        content:
          typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content),
        senderId: message.senderId,
        mentions: message.mentions,
        reactions: message.reactions,
        parts: message.parts,
        experimental_attachments: message.experimental_attachments?.map(
          (a) => ({
            url: a.url,
            name: a.name ?? "",
            contentType: a.contentType ?? "",
          }),
        ),
      });
    },
  };
}

/**
 * Legacy hook for backward compatibility
 * Used in ChatProvider
 */
export function useChatHistory(
  setMessages: (messages: Message[]) => void,
  streamActive = false,
) {
  const conversations = useConversations();
  const { currentConversationId, setCurrentConversation } = useSelectionStore();
  const messages = useMessages(currentConversationId);

  // Update AI SDK messages when messages change
  useEffect(() => {
    if (streamActive) return;
    if (messages) {
      // Filter out "tool" role as AI SDK doesn't support it directly
      const aiMessages: Message[] = messages
        .filter((m) => m.role !== "tool")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system" | "data",
          content: m.content,
          senderId: m.senderId,
          mentions: m.mentions,
          reactions: m.reactions,
          parts: m.parts as Message["parts"],
          experimental_attachments:
            m.experimental_attachments as Message["experimental_attachments"],
          createdAt: m.createdAt,
        }));
      setMessages(aiMessages);
    }
  }, [messages, setMessages, streamActive]);

  // Convert format
  const chatHistory: ConversationData[] = (conversations || []).map((conv) => ({
    id: conv.id,
    title: conv.title,
    agentId: conv.agentId,
    modelId: conv.modelId,
    activeRevision: conv.activeRevision,
    activeProviderId: conv.activeProviderId,
    activeModelId: conv.activeModelId,
    systemPrompt: conv.systemPrompt,
    metadata: conv.metadata as ConversationData["metadata"],
    messages: [],
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
  }));

  const selectChat = useCallback(
    async (conversationId: string) => {
      setCurrentConversation(conversationId);
    },
    [setCurrentConversation],
  );

  const deleteChat = useCallback(
    async (conversationId: string) => {
      try {
        await deleteConversationWithRuntime(conversationId, true);
      } catch (error) {
        if (await db.pendingConversationDeletions.get(conversationId)) {
          notifyDeferredDeletion(conversationId, error);
        }
        throw error;
      } finally {
        const [intent, conversation] = await Promise.all([
          db.pendingConversationDeletions.get(conversationId),
          db.conversations.get(conversationId),
        ]);
        if (
          currentConversationId === conversationId &&
          (intent || !conversation)
        ) {
          setCurrentConversation(null);
        }
        if (!intent) {
          clearDeletionFailureNotification(conversationId);
        }
      }
    },
    [currentConversationId, setCurrentConversation],
  );

  const createNewConversation = useCallback(
    async (options?: {
      title?: string;
      agentId?: string;
      modelId?: string;
      initialMessage?: {
        role: "user" | "assistant" | "system";
        content: string;
      };
    }) => {
      const selection = parseModelSelection(options?.modelId);
      const id = await createConversation({
        title: options?.title ?? null,
        agentId: options?.agentId ?? null,
        modelId: options?.modelId ?? null,
        activeRevision: 0,
        activeProviderId: selection.providerId,
        activeModelId: selection.activeModelId,
        systemPrompt: null,
        metadata: null,
      });

      if (options?.initialMessage) {
        await addMessage(id, {
          role: options.initialMessage.role,
          content: options.initialMessage.content,
        });
      }

      setCurrentConversation(id);

      return {
        id,
        title: options?.title ?? null,
        agentId: options?.agentId ?? null,
        modelId: options?.modelId ?? null,
        activeRevision: 0,
        activeProviderId: selection.providerId,
        activeModelId: selection.activeModelId,
        systemPrompt: null,
        metadata: null,
        messages: options?.initialMessage
          ? [
              {
                id: `msg_${Date.now()}`,
                role: options.initialMessage.role,
                content: options.initialMessage.content,
              },
            ]
          : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as ConversationData;
    },
    [setCurrentConversation],
  );

  return {
    chatHistory,
    loading: conversations === undefined,
    error: null,
    refreshing: false,
    currentConversationId,
    fetchChatHistory: () => Promise.resolve(), // No-op, Dexie handles reactivity
    selectChat,
    deleteChat,
    createConversation: createNewConversation,
  };
}
