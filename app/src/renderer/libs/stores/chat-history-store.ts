import { Message } from "ai";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isLoggedIn } from "../auth-client";
import { getApiBaseUrl } from "../env";

// Standard conversation data (same for local and server)
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
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface ChatHistoryState {
  // Single source of truth for all conversations
  conversations: ConversationData[];

  // Current state
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  isLoggedIn: boolean;

  // Core actions
  getConversations: () => Promise<void>;
  addConversation: (
    conversation: Omit<ConversationData, "id" | "createdAt" | "updatedAt">,
  ) => string;
  updateConversation: (id: string, updates: Partial<ConversationData>) => void;
  deleteConversation: (conversationId: string) => Promise<void>;
  selectConversation: (
    conversationId: string,
    setMessages: (messages: Message[]) => void,
  ) => Promise<void>;
  createConversation: (options?: {
    title?: string;
    agentId?: string;
    modelId?: string;
    initialMessage?: {
      role: "user" | "assistant" | "system";
      content: string;
    };
  }) => Promise<ConversationData | null>;

  // Utility actions
  initializeStore: () => Promise<void>;
  syncConversationToServer: (conversation: ConversationData) => Promise<void>;
  syncLocalToServer: () => Promise<void>;
  toggleHistoryWindow: () => Promise<void>;
}

export const useChatHistoryStore = create<ChatHistoryState>()(
  persist(
    (set, get) => ({
      conversations: [],
      loading: true,
      error: null,
      refreshing: false,
      isLoggedIn: false,

      // Initialize store and get conversations
      initializeStore: async () => {
        set({ loading: true });
        try {
          const loggedIn = await isLoggedIn();
          set({ isLoggedIn: loggedIn });
          await get().getConversations();
        } catch (error) {
          set({ error: "Failed to initialize chat history store" });
          console.error("Store initialization error:", error);
        } finally {
          set({ loading: false });
        }
      },

      // Single method to get conversations based on login status
      getConversations: async () => {
        set({ refreshing: true });

        try {
          const loggedIn = await isLoggedIn();
          set({ isLoggedIn: loggedIn });

          if (loggedIn) {
            // Get from server
            const API_BASE = getApiBaseUrl() + "/chat";
            const response = await fetch(API_BASE, {
              credentials: "include",
              headers: { "Content-Type": "application/json" },
            });

            const data = await response.json();

            if (data.status === "success") {
              const serverConversations = data.conversations || [];

              // Merge with local conversations (keep local ones that haven't been synced)
              const { conversations: localConversations } = get();
              const localOnlyConversations = localConversations.filter((conv) =>
                conv.id.startsWith("local_"),
              );

              // Update store with server conversations + remaining local ones
              set({
                conversations: [
                  ...serverConversations,
                  ...localOnlyConversations,
                ],
                error: null,
              });

              // Sync local conversations to server if any exist
              if (localOnlyConversations.length > 0) {
                await get().syncLocalToServer();
              }
            } else {
              set({ error: "Failed to load conversations" });
              console.error("API Error:", data);
            }
          }
          // If not logged in, just use existing local conversations (from persist)
        } catch (err) {
          set({ error: "Failed to connect to conversation service" });
          console.error("Fetch error:", err);
        } finally {
          set({ loading: false, refreshing: false });
        }
      },

      // Add conversation (local ID, will sync to server if logged in)
      addConversation: (conversation) => {
        const id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newConversation: ConversationData = {
          ...conversation,
          id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          conversations: [newConversation, ...state.conversations],
        }));

        // Auto-sync to server if logged in
        const { isLoggedIn: loggedIn } = get();
        if (loggedIn) {
          get().syncConversationToServer(newConversation);
        }

        return id;
      },

      // Update conversation
      updateConversation: (id, updates) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id
              ? { ...conv, ...updates, updatedAt: new Date().toISOString() }
              : conv,
          ),
        }));

        // Auto-sync to server if logged in and it's a server conversation
        const { isLoggedIn: loggedIn } = get();
        if (loggedIn && !id.startsWith("local_")) {
          // TODO: Implement server update API
          console.log("Server conversation update not implemented yet");
        }
      },

      // Delete conversation
      deleteConversation: async (conversationId) => {
        try {
          const { isLoggedIn: loggedIn } = get();

          if (!conversationId.startsWith("local_") && loggedIn) {
            // Delete from server
            const API_BASE = getApiBaseUrl() + "/chat";
            const response = await fetch(`${API_BASE}/${conversationId}`, {
              method: "DELETE",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
            });

            const data = await response.json();
            if (data.status !== "success") {
              set({ error: "Failed to delete conversation" });
              console.error("Delete API Error:", data);
              return;
            }
          }

          // Remove from local state
          set((state) => ({
            conversations: state.conversations.filter(
              (conv) => conv.id !== conversationId,
            ),
          }));
        } catch (err) {
          set({ error: "Failed to delete conversation" });
          console.error("Delete error:", err);
        }
      },

      // Select and load conversation
      selectConversation: async (conversationId, setMessages) => {
        const { conversations } = get();
        let conversation = conversations.find(
          (conv) => conv.id === conversationId,
        );

        // If not found locally and logged in, try to fetch from server
        if (!conversation && !conversationId.startsWith("local_")) {
          const { isLoggedIn: loggedIn } = get();
          if (loggedIn) {
            try {
              const API_BASE = getApiBaseUrl() + "/chat";
              const response = await fetch(`${API_BASE}/${conversationId}`, {
                credentials: "include",
                headers: { "Content-Type": "application/json" },
              });

              const data = await response.json();
              if (data.status === "success" && data.conversation) {
                conversation = data.conversation as ConversationData;

                // Add to local cache
                set((state) => ({
                  conversations: [conversation!, ...state.conversations],
                }));
              }
            } catch (error) {
              console.error("Failed to fetch conversation:", error);
            }
          }
        }

        if (conversation) {
          setMessages(conversation.messages);

          // Dispatch custom event for other components
          const conversationSelectedEvent = new CustomEvent(
            "conversation-selected",
            { detail: { conversation } },
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
          set({ error: "Conversation not found" });
        }
      },

      // Create new conversation (auto-saves to server if logged in)
      createConversation: async (options = {}) => {
        const { isLoggedIn: loggedIn } = get();

        if (loggedIn) {
          // Create on server directly
          try {
            const API_BASE = getApiBaseUrl() + "/chat";
            const response = await fetch(API_BASE, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(options),
            });

            const data = await response.json();
            if (data.status === "success" && data.conversation) {
              const newConversation = data.conversation as ConversationData;

              // Add to local cache
              set((state) => ({
                conversations: [newConversation, ...state.conversations],
              }));

              return newConversation;
            } else {
              set({ error: "Failed to create conversation" });
              return null;
            }
          } catch (err) {
            set({ error: "Failed to create conversation" });
            console.error("Create error:", err);
            return null;
          }
        } else {
          // Create locally
          const conversationId = get().addConversation({
            title: options.title || null,
            agentId: options.agentId || null,
            modelId: options.modelId || null,
            systemPrompt: null,
            metadata: null,
            messages: options.initialMessage
              ? [
                  {
                    id: `msg_${Date.now()}`,
                    role: options.initialMessage.role,
                    content: options.initialMessage.content,
                  },
                ]
              : [],
          });

          const localConv = get().conversations.find(
            (c) => c.id === conversationId,
          );
          return localConv || null;
        }
      },

      // Sync individual conversation to server
      syncConversationToServer: async (conversation: ConversationData) => {
        try {
          const API_BASE = getApiBaseUrl() + "/chat";
          const response = await fetch(API_BASE, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: conversation.title || "Synced Chat",
              agentId: conversation.agentId || undefined,
              modelId: conversation.modelId || undefined,
              initialMessage: conversation.messages[0]
                ? {
                    role: conversation.messages[0].role as
                      | "user"
                      | "assistant"
                      | "system",
                    content: conversation.messages[0].content,
                  }
                : undefined,
            }),
          });

          const data = await response.json();
          if (data.status === "success" && data.conversation) {
            const serverConversation = data.conversation as ConversationData;

            // Replace local conversation with server version
            set((state) => ({
              conversations: state.conversations.map((conv) =>
                conv.id === conversation.id ? serverConversation : conv,
              ),
            }));
          }
        } catch (error) {
          console.error("Failed to sync conversation to server:", error);
        }
      },

      // Sync all local conversations to server
      syncLocalToServer: async () => {
        const { conversations, isLoggedIn: loggedIn } = get();
        if (!loggedIn) return;

        const localConversations = conversations.filter((conv) =>
          conv.id.startsWith("local_"),
        );

        for (const localConv of localConversations) {
          await get().syncConversationToServer(localConv);
        }
      },

      toggleHistoryWindow: async () => {
        try {
          await window.electronAPI?.toggleWindow("history");
        } catch (error) {
          console.error("Error toggling chat history window:", error);
        }
      },
    }),
    {
      name: "chat-history-storage",
      // Persist all conversations
      partialize: (state) => ({
        conversations: state.conversations,
      }),
    },
  ),
);

/**
 * Legacy hook for backward compatibility
 * Now uses the simplified zustand store
 */
export function useChatHistory(setMessages: (messages: Message[]) => void) {
  const store = useChatHistoryStore();
  const [hasInitialized, setHasInitialized] = useState(false);

  // Initialize store on first use
  useEffect(() => {
    if (!hasInitialized) {
      store.initializeStore();
      setHasInitialized(true);
    }
  }, [hasInitialized]);

  // Handle localStorage changes (cross-window communication)
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "selectedConversation" && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (data.conversation && data.conversation.messages) {
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

  // Create legacy API compatible methods
  const selectChat = useCallback(
    (conversationId: string) =>
      store.selectConversation(conversationId, setMessages),
    [store, setMessages],
  );

  const deleteChat = useCallback(
    (conversationId: string) => store.deleteConversation(conversationId),
    [store],
  );

  return {
    // State
    chatHistory: store.conversations,
    loading: store.loading,
    error: store.error,
    refreshing: store.refreshing,

    // Actions (legacy compatible)
    fetchChatHistory: store.getConversations,
    selectChat,
    deleteChat,
    createConversation: store.createConversation,
    toggleHistoryWindow: store.toggleHistoryWindow,
  };
}
