import { Message } from "ai";
import { useCallback, useEffect, useState } from "react";

// Standard conversation data from new API (already in AI SDK format)
interface ConversationData {
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
  messages: Message[]; // Already in AI SDK format!
  createdAt: string;
  updatedAt: string;
}

/**
 * Hook to handle chat history functionality using new conversation API
 */
export function useChatHistory(setMessages: (messages: Message[]) => void) {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const API_BASE = "http://localhost:3001/api/chat";

  /**
   * Fetch user's conversations
   */
  const fetchConversations = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(API_BASE, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.status === "success") {
        setConversations(data.conversations || []);
        setError(null);
      } else {
        setError("Failed to load conversations");
        console.error("API Error:", data);
      }
    } catch (err) {
      setError("Failed to connect to conversation service");
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /**
   * Select a conversation and load its messages
   */
  const selectConversation = useCallback(
    async (conversationId: string) => {
      try {
        const response = await fetch(`${API_BASE}/${conversationId}`, {
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = await response.json();

        if (data.status === "success" && data.conversation) {
          const conversation = data.conversation as ConversationData;

          // Messages are already in AI SDK format, no conversion needed!
          setMessages(conversation.messages);

          // Dispatch custom event for other components
          const conversationSelectedEvent = new CustomEvent(
            "conversation-selected",
            {
              detail: { conversation },
            },
          );
          window.dispatchEvent(conversationSelectedEvent);

          // Store in localStorage for cross-window communication
          const eventData = JSON.stringify({
            eventType: "conversation-selected",
            timestamp: new Date().toISOString(),
            conversation,
          });
          localStorage.setItem("selectedConversation", eventData);

          // Close history window if in Electron
          if (window.electronAPI) {
            window.electronAPI.toggleWindow("history");
          }
        } else {
          setError("Failed to load conversation");
          console.error("API Error:", data);
        }
      } catch (err) {
        setError("Failed to load conversation");
        console.error("Select conversation error:", err);
      }
    },
    [setMessages],
  );

  /**
   * Delete a conversation
   */
  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      const response = await fetch(`${API_BASE}/${conversationId}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.status === "success") {
        // Remove conversation from local state
        setConversations((prev) =>
          prev.filter((conv) => conv.id !== conversationId),
        );
      } else {
        setError("Failed to delete conversation");
        console.error("Delete API Error:", data);
      }
    } catch (err) {
      setError("Failed to delete conversation");
      console.error("Delete error:", err);
    }
  }, []);

  /**
   * Create a new conversation
   */
  const createConversation = useCallback(
    async (
      options: {
        title?: string;
        agentId?: string;
        modelId?: string;
        initialMessage?: {
          role: "user" | "assistant" | "system";
          content: string;
        };
      } = {},
    ) => {
      try {
        const response = await fetch(API_BASE, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(options),
        });

        const data = await response.json();

        if (data.status === "success" && data.conversation) {
          const newConversation = data.conversation as ConversationData;
          setConversations((prev) => [newConversation, ...prev]);
          return newConversation;
        } else {
          setError("Failed to create conversation");
          console.error("Create API Error:", data);
          return null;
        }
      } catch (err) {
        setError("Failed to create conversation");
        console.error("Create error:", err);
        return null;
      }
    },
    [],
  );

  /**
   * Open/close chat history window
   */
  const toggleHistoryWindow = useCallback(async () => {
    try {
      await window.electronAPI?.toggleWindow("history");
    } catch (error) {
      console.error("Error toggling chat history window:", error);
    }
  }, []);

  /**
   * Handle localStorage changes (cross-window communication)
   */
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "selectedConversation" && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (data.conversation && data.conversation.messages) {
            // Messages are already in AI SDK format, no conversion needed!
            setMessages(data.conversation.messages);
          }
        } catch (error) {
          console.warn("Error parsing conversation from localStorage:", error);
        }
      }
    };

    const handleConversationSelected = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.conversation) {
        const conversation = customEvent.detail
          .conversation as ConversationData;
        // Messages are already in AI SDK format, no conversion needed!
        setMessages(conversation.messages);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(
      "conversation-selected",
      handleConversationSelected,
    );

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(
        "conversation-selected",
        handleConversationSelected,
      );
    };
  }, [setMessages]);

  // Auto-fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    // State
    chatHistory: conversations,
    loading,
    error,
    refreshing,

    // Actions
    fetchChatHistory: fetchConversations,
    selectChat: selectConversation,
    deleteChat: deleteConversation,
    createConversation,
    toggleHistoryWindow,
  };
}
