import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare, RefreshCw, Search, Trash2, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useChatHistory } from "../libs/hooks/use-chat-history";
import { useThemeSync } from "../libs/hooks/use-theme-sync";
import { useWindowClose } from "../libs/hooks/use-window-close";
import { cleanTitle } from "../libs/utils/tag";

export const Route = createFileRoute("/history")({
  component: ChatHistoryPage,
});

function ChatHistoryPage() {
  const [searchQuery, setSearchQuery] = useState("");

  // we don't need to set messages in this window
  const {
    chatHistory,
    loading,
    error,
    refreshing,
    fetchChatHistory,
    selectChat,
    deleteChat,
  } = useChatHistory(() => {});

  // Listen for theme changes from settings
  useThemeSync();

  // Handle Command+W for history window
  useWindowClose({ type: "toggle", windowType: "history" });

  // Handle initial fetch and window focus/visibility events
  useEffect(() => {
    fetchChatHistory();
    const handleFocus = () => {
      fetchChatHistory();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchChatHistory();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("window-show", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("window-show", handleFocus);
    };
  }, [fetchChatHistory]);

  // Filter chats based on search query
  const filteredHistory = chatHistory.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Handle selecting a chat
  const handleSelectChat = async (chatId: string) => {
    await selectChat(chatId);
  };

  // Handle deleting a chat
  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    await deleteChat(chatId);
  };

  // Handle refreshing chat list manually
  const handleRefresh = () => {
    fetchChatHistory();
  };

  // Format the date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);

      if (date.toDateString() === now.toDateString()) {
        return `Today, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      } else if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      } else {
        return date.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">Chat History</h1>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            aria-label="Refresh chat history"
            disabled={refreshing}
          >
            <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
        <Link to="/">
          <button
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            aria-label="Close history"
          >
            <X size={20} />
          </button>
        </Link>
      </div>

      <div className="relative mb-6">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          size={18}
        />
        <input
          type="text"
          placeholder="Search conversations..."
          className="w-full rounded-md border border-gray-300 py-3 pl-10 pr-4 dark:border-gray-600 dark:bg-gray-800"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto pr-2">
        {loading && chatHistory.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p>Loading chat history...</p>
          </div>
        ) : error && chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-red-500 mb-2">{error}</p>
            <button
              className="px-4 py-2 bg-primary text-white rounded-md"
              onClick={handleRefresh}
            >
              Retry
            </button>
          </div>
        ) : filteredHistory.length > 0 ? (
          <ul className="space-y-3">
            {filteredHistory.map((chat) => (
              <li
                key={chat.id}
                className="flex cursor-pointer items-start rounded-md border border-gray-200 p-4 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                onClick={() => handleSelectChat(chat.id)}
              >
                <MessageSquare
                  className="mr-4 shrink-0 text-primary"
                  size={24}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-lg truncate">
                      {cleanTitle(chat.title)}
                    </h3>
                    <span className="text-sm text-gray-500 whitespace-nowrap ml-2">
                      {formatDate(chat.lastUpdated)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center text-xs text-gray-400">
                    <span className="mr-2">{chat.messageCount} messages</span>
                    <span className="mr-2">•</span>
                    <span>{formatDate(chat.createdAt)}</span>
                  </div>
                </div>
                <button
                  className="ml-3 p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={(e) => handleDeleteChat(e, chat.id)}
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center h-[40vh] text-center">
            <MessageSquare className="text-gray-400 mb-3" size={32} />
            <p className="text-lg text-gray-500">No conversations found</p>
            {searchQuery && (
              <p className="text-sm text-gray-400 mt-1">
                Try a different search term
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
