import { ChatData } from "@/server/service/chat";
import { Message } from "ai";
import { useCallback, useEffect, useState } from "react";

// Interface for chat data
interface ChatHistoryData {
  id: string;
  title: string;
  createdAt: string;
  lastUpdated: string;
  messageCount: number;
  messages?: {
    id: string;
    role: string;
    content: string;
    timestamp: string;
  }[];
}

/**
 * Hook to handle chat history functionality
 */
export function useChatHistory(setMessages: (messages: Message[]) => void) {
  const [chatHistory, setChatHistory] = useState<ChatHistoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Function to fetch chat history
   */
  const fetchChatHistory = useCallback(async () => {
    setRefreshing(true);
    const response = await fetch("http://localhost:38000/api/chat");
    const data = await response.json();

    if (data.status === "success") {
      setChatHistory(data.chats);
      setError(null);
    } else {
      setError("Failed to load chat history");
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  /**
   * Function to select a chat and dispatch events
   */
  const selectChat = useCallback(async (chatId: string) => {
    const response = await fetch(`http://localhost:38000/api/chat/${chatId}`);
    const data = await response.json();

    if (data.status === "success") {
      const chatSelectedEvent = new CustomEvent("chat-history-selected", {
        detail: { chat: data.chat },
      });
      window.dispatchEvent(chatSelectedEvent);

      const chatData = JSON.stringify({
        eventType: "chat-history-selected",
        timestamp: new Date().toISOString(),
        chat: data.chat,
      });
      localStorage.setItem("selectedChatHistory", chatData);

      if (window.electronAPI) {
        window.electronAPI.toggleWindow("history");
      }
    } else {
      setError("Failed to load chat");
    }
  }, []);

  /**
   * Function to delete a chat
   */
  const deleteChat = useCallback(async (chatId: string) => {
    const response = await fetch(`http://localhost:38000/api/chat/${chatId}`, {
      method: "DELETE",
    });
    const data = await response.json();

    if (data.status === "success") {
      // Remove chat from the local state
      setChatHistory((prevChats) =>
        prevChats.filter((chat) => chat.id !== chatId),
      );
    } else {
      setError("Failed to delete chat");
    }
  }, []);

  useEffect(() => {
    const handleChatHistorySelected = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.chat) {
        const chatHistory = customEvent.detail.chat as ChatData;
        if (
          chatHistory &&
          chatHistory.messages &&
          chatHistory.messages.length > 0
        ) {
          setMessages(chatHistory.messages);
        }
      }
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "selectedChatHistory" && event.newValue) {
        console.log("Detected chat history change in localStorage (hook)");
        const message = parseStoreMessage(event.newValue);
        setMessages(message);
      }
    };

    window.addEventListener("chat-history-selected", handleChatHistorySelected);
    window.addEventListener("storage", handleStorageChange);

    // Cleanup event listeners
    return () => {
      window.removeEventListener(
        "chat-history-selected",
        handleChatHistorySelected,
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [setMessages]);

  return {
    // State
    chatHistory,
    loading,
    error,
    refreshing,
    // Actions
    fetchChatHistory,
    selectChat,
    deleteChat,
  };
}

const parseStoreMessage = (json: string) => {
  try {
    const chatData = JSON.parse(json) as { chat: ChatData };
    if (chatData && chatData.chat) {
      const chatHistory = chatData.chat;
      return chatHistory.messages;
    }
  } catch (_error) {
    console.warn("parsing chat history from storage event (hook):", _error);
  }
  return [];
};
