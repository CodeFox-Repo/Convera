import { useChatHistory } from "@/renderer/libs/hooks/use-chat-history";
import { useAgentStore } from "@/renderer/libs/stores/agent-store";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { cleanTitle } from "@/renderer/libs/utils/tag";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { UserButton } from "../auth/user-button";
import ChatInput, { ChatInputRef } from "../chat/input/chat-input";
import ChatContent from "../chat/message/chat-content";

export function HomePage() {
  const chatInputRef = useRef<ChatInputRef>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isLoading,
    editMessage,
    regenerateMessage,
    error,
    resetChat,
  } = useChatContext();

  const { agentChanged, handleAgentChange } = useAgentStore();

  // Use real chat history
  const {
    chatHistory,
    loading: historyLoading,
    error: historyError,
    refreshing,
    fetchChatHistory,
    selectChat,
    deleteChat,
  } = useChatHistory(() => {});

  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Fetch chat history on component mount
  useEffect(() => {
    fetchChatHistory();
  }, [fetchChatHistory]);

  const handleNewChat = () => {
    // Clear current messages to start a new chat
    resetChat();
    setCurrentSessionId("");
  };

  const handleSelectChat = async (chatId: string) => {
    setCurrentSessionId(chatId);
    await selectChat(chatId);
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    await deleteChat(chatId);
    if (currentSessionId === chatId) {
      setCurrentSessionId("");
      resetChat();
    }
  };

  const formatTimestamp = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) return "Today";
      if (diffDays === 2) return "Yesterday";
      if (diffDays <= 7) return `${diffDays - 1} days ago`;
      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  // Get current chat title for header
  const getCurrentChatTitle = () => {
    if (currentSessionId) {
      const currentChat = chatHistory.find(
        (chat) => chat.id === currentSessionId,
      );
      return currentChat ? cleanTitle(currentChat.title) : "Chat";
    }
    return messages.length > 0 ? "New Chat" : "Chat";
  };

  return (
    <div className="h-screen w-full flex bg-background">
      {/* Sidebar */}
      <motion.div
        className={`bg-card flex flex-col border-r border-border transition-all duration-300 ${
          sidebarCollapsed ? "w-16" : "w-80"
        }`}
        initial={false}
        animate={{ width: sidebarCollapsed ? 64 : 320 }}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-border">
          {!sidebarCollapsed ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={20} className="text-orange-500" />
                <h1 className="text-lg font-semibold text-foreground">
                  FoxyChat
                </h1>
              </div>
              <button
                onClick={handleNewChat}
                className="p-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors"
                aria-label="New chat"
              >
                <Plus size={16} />
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                onClick={handleNewChat}
                className="p-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors"
                aria-label="New chat"
              >
                <Plus size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Chat Sessions */}
        <div className="flex-1 overflow-y-auto">
          {!sidebarCollapsed ? (
            <div className="p-2">
              {historyLoading && chatHistory.length === 0 ? (
                <div className="flex items-center justify-center p-8">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                    <p className="text-sm text-muted-foreground">
                      Loading history...
                    </p>
                  </div>
                </div>
              ) : historyError ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-destructive mb-2">
                    {historyError}
                  </p>
                  <button
                    onClick={fetchChatHistory}
                    className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded-md"
                  >
                    Retry
                  </button>
                </div>
              ) : chatHistory.length > 0 ? (
                chatHistory.map((chat) => (
                  <motion.div
                    key={chat.id}
                    onClick={() => handleSelectChat(chat.id)}
                    className={`group relative p-3 mb-1 rounded-lg cursor-pointer transition-all ${
                      currentSessionId === chat.id
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50"
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-start gap-3">
                      <MessageSquare
                        size={16}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">
                          {cleanTitle(chat.title)}
                        </h3>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(chat.lastUpdated)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {chat.messageCount} msgs
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all flex gap-1">
                      <button
                        onClick={(e) => handleDeleteChat(e, chat.id)}
                        className="p-1 rounded hover:bg-destructive/20 hover:text-destructive transition-all"
                        title="Delete chat"
                      >
                        <Trash2 size={12} />
                      </button>
                      <button className="p-1 rounded hover:bg-muted transition-all">
                        <MoreHorizontal size={12} />
                      </button>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="p-4 text-center">
                  <MessageSquare
                    className="mx-auto mb-2 text-muted-foreground"
                    size={32}
                  />
                  <p className="text-sm text-muted-foreground">
                    No conversations yet
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Start a new chat to begin
                  </p>
                </div>
              )}

              {refreshing && chatHistory.length > 0 && (
                <div className="flex items-center justify-center p-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-2">
              {chatHistory.map((chat) => (
                <motion.div
                  key={chat.id}
                  onClick={() => handleSelectChat(chat.id)}
                  className={`p-2 mb-1 rounded-lg cursor-pointer transition-all flex justify-center ${
                    currentSessionId === chat.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50"
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title={cleanTitle(chat.title)}
                >
                  <MessageSquare size={16} />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="border-t border-border p-4">
          {!sidebarCollapsed ? (
            <div className="space-y-2">
              <button className="w-full p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3">
                <Archive size={16} />
                <span className="text-sm">Archive</span>
              </button>
              <button className="w-full p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3">
                <Settings size={16} />
                <span className="text-sm">Settings</span>
              </button>
              <UserButton collapsed={false} />
            </div>
          ) : (
            <div className="space-y-2 flex flex-col items-center">
              <button className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
                <Archive size={16} />
              </button>
              <button className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
                <Settings size={16} />
              </button>
              <UserButton collapsed={true} />
            </div>
          )}
        </div>
      </motion.div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-background">
        {/* Chat Header */}
        <div className="h-16 border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-foreground">
              {getCurrentChatTitle()}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium">
              Online
            </div>
          </div>
        </div>

        {/* Messages Area */}
        {messages.length > 0 ? (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto p-6">
              <ChatContent
                messages={messages}
                messagesEndRef={messagesEndRef}
                isLoading={isLoading}
                onEditMessage={editMessage}
                onRegenerateMessage={regenerateMessage}
                agentChanged={agentChanged}
                onRegenerateWithNewAgent={() => handleAgentChange(true)}
                onIgnoreAgentChange={() => handleAgentChange(false)}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-6 max-w-md">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-pink-500 rounded-2xl flex items-center justify-center mx-auto">
                <Sparkles size={32} className="text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-foreground mb-2">
                  Welcome to FoxyChat
                </h3>
                <p className="text-muted-foreground">
                  {chatHistory.length > 0
                    ? "Select a conversation from the sidebar or start a new chat"
                    : "Start a conversation by typing a message below"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-6 mb-4"
            >
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <p className="text-destructive text-sm">
                  {error.message ||
                    "An error occurred. Please check your API key or try again later."}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Area */}
        <div className="border-t border-border p-6">
          <div className="max-w-4xl mx-auto">
            <ChatInput
              ref={chatInputRef}
              hasMessages={messages.length > 0}
              placeholder="Message FoxyChat..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
