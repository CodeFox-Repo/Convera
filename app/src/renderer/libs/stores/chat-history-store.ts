/**
 * Chat History Store - Dexie 版本
 *
 * 完全本地存储，不再与云端同步
 * 使用 Dexie liveQuery 实现实时数据更新和多窗口同步
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
  } | null;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

// ==================== Hooks ====================

/**
 * 主要的聊天历史 hook
 * 替代旧的 useChatHistoryStore
 */
export function useChatHistoryStore() {
  const conversations = useConversations();
  const { currentConversationId, setCurrentConversation } = useSelectionStore();
  const messages = useMessages(currentConversationId);

  // 转换为旧格式的 ConversationData（带 messages）
  const conversationsWithMessages: ConversationData[] = (conversations || []).map(
    (conv) => ({
      id: conv.id,
      title: conv.title,
      agentId: conv.agentId,
      modelId: conv.modelId,
      systemPrompt: conv.systemPrompt,
      metadata: conv.metadata as ConversationData["metadata"],
      messages: [], // Messages 单独查询
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    })
  );

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
      updates: Partial<Omit<Conversation, "id" | "createdAt">>
    ) => {
      await updateConversation(id, updates);
    },

    deleteConversation: async (id: string) => {
      await deleteConv(id);
      if (currentConversationId === id) {
        setCurrentConversation(null);
      }
    },

    // 保存消息到当前对话
    saveMessages: async (msgs: Message[]) => {
      if (!currentConversationId) return;

      await updateMessages(
        currentConversationId,
        msgs.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system" | "tool",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          toolInvocations: m.toolInvocations,
          experimental_attachments: m.experimental_attachments?.map((a) => ({
            url: a.url,
            name: a.name ?? "",
            contentType: a.contentType ?? "",
          })),
        }))
      );
    },

    // 添加单条消息
    addMessage: async (message: Omit<Message, "id">) => {
      if (!currentConversationId) return;

      await addMessage(currentConversationId, {
        role: message.role as "user" | "assistant" | "system" | "tool",
        content: typeof message.content === "string" ? message.content : JSON.stringify(message.content),
        toolInvocations: message.toolInvocations,
        experimental_attachments: message.experimental_attachments?.map((a) => ({
          url: a.url,
          name: a.name ?? "",
          contentType: a.contentType ?? "",
        })),
      });
    },
  };
}

/**
 * Legacy hook for backward compatibility
 * 用于 ChatProvider 中
 */
export function useChatHistory(setMessages: (messages: Message[]) => void) {
  const conversations = useConversations();
  const { currentConversationId, setCurrentConversation } = useSelectionStore();
  const messages = useMessages(currentConversationId);

  // 当消息变化时更新 AI SDK 的 messages
  useEffect(() => {
    if (messages && messages.length > 0) {
      // Filter out "tool" role as AI SDK doesn't support it directly
      const aiMessages: Message[] = messages
        .filter((m) => m.role !== "tool")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system" | "data",
          content: m.content,
          toolInvocations: m.toolInvocations as Message["toolInvocations"],
          experimental_attachments: m.experimental_attachments as Message["experimental_attachments"],
          createdAt: m.createdAt,
        }));
      setMessages(aiMessages);
    }
  }, [messages, setMessages]);

  // 转换格式
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
    [setCurrentConversation]
  );

  const deleteChat = useCallback(
    async (conversationId: string) => {
      await deleteConv(conversationId);
      if (currentConversationId === conversationId) {
        setCurrentConversation(null);
      }
    },
    [currentConversationId, setCurrentConversation]
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
    [setCurrentConversation]
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
