/**
 * Chat History Store - Dexie Version
 *
 * Fully local storage, no cloud sync
 * Uses Dexie liveQuery for real-time data updates and multi-window sync
 */

import { Message } from "ai";
import { useCallback, useEffect } from "react";
import {
  useConversations,
  useMessages,
  createConversation,
  updateConversation,
  deleteConversation as deleteConv,
  addMessage,
  updateMessages,
  type Conversation,
} from "../db";
import { useSelectionStore } from "../db/ui-state";

// Re-export types for backward compatibility
export interface ConversationData {
  id: string;
  title: string | null;
  agentId: string | null;
  modelId: string | null;
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
      const id = await createConversation({
        title: options?.title ?? null,
        agentId: options?.agentId ?? null,
        modelId: options?.modelId ?? null,
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
      await deleteConv(id);
      if (currentConversationId === id) {
        setCurrentConversation(null);
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
          toolInvocations: m.toolInvocations,
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
        toolInvocations: message.toolInvocations,
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
    if (messages && messages.length > 0) {
      // Filter out "tool" role as AI SDK doesn't support it directly
      const aiMessages: Message[] = messages
        .filter((m) => m.role !== "tool")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system" | "data",
          content: m.content,
          toolInvocations: m.toolInvocations as Message["toolInvocations"],
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
      await deleteConv(conversationId);
      if (currentConversationId === conversationId) {
        setCurrentConversation(null);
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
      const id = await createConversation({
        title: options?.title ?? null,
        agentId: options?.agentId ?? null,
        modelId: options?.modelId ?? null,
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
