import { useAgentStore } from "@/renderer/libs/stores/agent-store";
import { useChatHistory } from "@/renderer/libs/stores/chat-history-store";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { cleanTitle } from "@/renderer/libs/utils/tag";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArrowLeft,
  Bot,
  ChevronLeft,
  ChevronRight,
  Code,
  LayoutGrid,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Plus,
  Server,
  Settings,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { UserButton } from "../auth/user-button";
import ChatInput, { ChatInputRef } from "../chat/input/chat-input";
import ChatContent from "../chat/message/chat-content";
import {
  EnhancedDragRegion,
  SidebarDragRegion,
} from "../ui/enhanced-drag-region";

// Import settings pages
import { AgentsSettingsPage } from "@/renderer/components/settings/pages/agents-page";
import { AppSettingsPage } from "@/renderer/components/settings/pages/app-page";
import { DeveloperSettingsPage } from "@/renderer/components/settings/pages/developer-page";
import { GeneralSettingsPage } from "@/renderer/components/settings/pages/general-page";
import { McpSettingsPage } from "@/renderer/components/settings/pages/mcp-page";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";

type ViewType = "chat" | "settings";
type SettingsTab = "general" | "app" | "agents" | "mcp" | "developer";

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
  const { currentTheme, handleToggleTheme } = useSettingsStore();

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
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewType>("chat");
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<SettingsTab>("general");

  // Helper to navigate to settings - auto-expands sidebar
  const navigateToSettings = () => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
    setActiveView("settings");
  };

  // Listen for navigate-to-settings from main process (tray menu)
  useEffect(() => {
    window.electronAPI?.onNavigateToSettings?.(navigateToSettings);
  }, [sidebarCollapsed]);

  // Listen for conversation switching from chat popup window
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "switchToConversation" && event.newValue) {
        const conversationId = event.newValue;
        console.log(
          "Main window received switchToConversation:",
          conversationId,
        );

        // Load the conversation using existing selectChat method
        // Clean up immediately to prevent other windows from processing this event
        localStorage.removeItem("switchToConversation");

        const loadConversation = async () => {
          try {
            console.log("Loading conversation:", conversationId);
            setCurrentSessionId(conversationId);
            setActiveView("chat");
            await selectChat(conversationId);
            console.log("Successfully loaded conversation in main window");
          } catch (error) {
            console.error("Failed to load conversation in main window:", error);
          }
        };

        loadConversation();
      }
    };

    // Listen for storage events from other windows
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [selectChat, chatHistory, setCurrentSessionId]);

  // Fetch chat history on component mount
  useEffect(() => {
    fetchChatHistory();
  }, [fetchChatHistory]);

  const handleNewChat = () => {
    // Clear current messages to start a new chat
    resetChat();
    setCurrentSessionId("");
    setActiveView("chat");
  };

  const handleSelectChat = async (chatId: string) => {
    setCurrentSessionId(chatId);
    setActiveView("chat");
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

  // Settings navigation items
  const settingsNavItems = [
    { id: "general" as SettingsTab, label: "General", icon: Settings },
    { id: "app" as SettingsTab, label: "Apps", icon: LayoutGrid },
    { id: "agents" as SettingsTab, label: "Agents", icon: Bot },
    { id: "mcp" as SettingsTab, label: "MCP Servers", icon: Server },
    { id: "developer" as SettingsTab, label: "Developer", icon: Code },
  ];

  // Render settings content based on active tab
  const renderSettingsContent = () => {
    switch (activeSettingsTab) {
      case "general":
        return <GeneralSettingsPage />;
      case "agents":
        return (
          <AgentsSettingsPage
            onNavigateToMcp={() => setActiveSettingsTab("mcp")}
          />
        );
      case "mcp":
        return <McpSettingsPage />;
      case "app":
        return <AppSettingsPage />;
      case "developer":
        return <DeveloperSettingsPage />;
      default:
        return <GeneralSettingsPage />;
    }
  };

  return (
    <div className="h-screen w-full flex bg-background relative">
      {/* Drag regions for all edges */}
      <EnhancedDragRegion top={24} bottom={24} left={24} right={24} />

      {/* Sidebar */}
      <motion.div
        className={`bg-card flex flex-col border-r border-border/60 ${
          sidebarCollapsed ? "w-0" : "w-80"
        }`}
        initial={false}
        animate={{ width: sidebarCollapsed ? 0 : 320 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        style={{ overflow: "hidden" }}
      >
        <SidebarDragRegion className="flex-1 flex flex-col h-full">
          {/* Sidebar Header */}
          {!sidebarCollapsed && (
            <div className="pt-8 px-4 pb-4 relative">
              {/* Drag whitespace area */}
              <div className="drag-whitespace absolute inset-0 pointer-events-none"></div>

              <div className="flex items-center justify-between relative z-10">
                {activeView === "chat" ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Sparkles size={20} className="text-orange-500" />
                      <h1 className="text-lg font-semibold text-foreground">
                        Convera
                      </h1>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleNewChat}
                        className="p-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors pointer-events-auto"
                        aria-label="New chat"
                        title="New Chat"
                      >
                        <Plus size={16} />
                      </button>
                      <button
                        onClick={() => setSidebarCollapsed(true)}
                        className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors pointer-events-auto"
                        aria-label="Collapse sidebar"
                        title="Collapse Sidebar"
                      >
                        <ChevronLeft size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveView("chat")}
                        className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors pointer-events-auto"
                        aria-label="Back to chat"
                        title="Back to Chat"
                      >
                        <ArrowLeft size={16} />
                      </button>
                      <h1 className="text-lg font-semibold text-foreground">
                        Settings
                      </h1>
                    </div>
                    <button
                      onClick={handleToggleTheme}
                      className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors pointer-events-auto"
                      title="Toggle theme"
                    >
                      {currentTheme === "dark" ? (
                        <Sun size={16} />
                      ) : (
                        <Moon size={16} />
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Sidebar Content - Chat History or Settings Navigation */}
          <div className="flex-1 overflow-y-auto min-h-0 relative z-0">
            {/* Drag whitespace area */}
            <div className="drag-whitespace absolute inset-0 pointer-events-none"></div>

            {!sidebarCollapsed && activeView === "chat" && (
              <div className="p-2 relative z-10">
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
                      className={`group relative p-3 mb-1 rounded-lg cursor-pointer transition-all pointer-events-auto ${
                        currentSessionId === chat.id
                          ? "bg-accent text-accent-foreground"
                          : menuOpenId === chat.id
                            ? "bg-accent/50 text-muted-foreground"
                            : "text-muted-foreground hover:bg-accent/50"
                      }`}
                      style={{
                        zIndex: 1,
                        position: "relative",
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-start gap-3 z-1">
                        <MessageSquare
                          size={16}
                          className="mt-0.5 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm truncate">
                            {cleanTitle(chat.title || "")}
                          </h3>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(chat.createdAt || "")}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {chat.messages.length} msgs
                            </span>
                          </div>
                        </div>
                      </div>

                      <div
                        className={`absolute top-2 right-2 transition-all ${
                          menuOpenId === chat.id
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        <Popover.Root
                          open={menuOpenId === chat.id}
                          onOpenChange={(open) =>
                            setMenuOpenId(open ? chat.id : null)
                          }
                        >
                          <Popover.Trigger asChild>
                            <button
                              className="p-1 rounded hover:bg-muted data-[state=open]:bg-muted transition-all"
                              title="More options"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal size={12} />
                            </button>
                          </Popover.Trigger>
                          <Popover.Portal>
                            <Popover.Content
                              className="w-32 bg-popover border border-border rounded-md shadow-xl py-1 z-50"
                              side="bottom"
                              align="end"
                              sideOffset={4}
                            >
                              <button
                                className="w-full px-3 py-1.5 text-left text-sm hover:bg-destructive/10 text-destructive transition-colors flex items-center gap-2"
                                onClick={(e) => handleDeleteChat(e, chat.id)}
                              >
                                <Trash2 size={12} />
                                Delete
                              </button>
                            </Popover.Content>
                          </Popover.Portal>
                        </Popover.Root>
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
            )}

            {/* Settings Navigation */}
            {!sidebarCollapsed && activeView === "settings" && (
              <nav className="p-2 space-y-1 relative z-10">
                {settingsNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSettingsTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors pointer-events-auto ${
                      activeSettingsTab === item.id
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    <item.icon size={16} className="flex-shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            )}
          </div>

          {/* Sidebar Footer - Fixed at bottom */}
          {!sidebarCollapsed && (
            <div className="border-t border-border/60 p-2 flex-shrink-0 relative z-10">
              {/* Drag whitespace area */}
              <div className="drag-whitespace absolute inset-0 pointer-events-none"></div>

              <div className="relative z-10">
                {activeView === "chat" && (
                  <>
                    <button className="w-full px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3 text-sm pointer-events-auto">
                      <Archive size={16} className="flex-shrink-0" />
                      <span>Archive</span>
                    </button>
                    <button
                      onClick={navigateToSettings}
                      className="w-full px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3 text-sm pointer-events-auto"
                    >
                      <Settings size={16} className="flex-shrink-0" />
                      <span>Settings</span>
                    </button>
                  </>
                )}
                <UserButton collapsed={false} />
              </div>
            </div>
          )}
        </SidebarDragRegion>
      </motion.div>

      {/* Floating Controls - positioned at left edge when sidebar is collapsed */}
      {sidebarCollapsed && (
        <div className="absolute top-8 left-4 z-20 flex gap-2">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="p-3 rounded-lg bg-background/80 backdrop-blur-sm border border-border/40 text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:border-border/60 transition-all duration-150"
            aria-label="Expand sidebar"
            title="Expand Sidebar"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={handleNewChat}
            className="p-3 rounded-lg bg-background/80 backdrop-blur-sm border border-border/40 text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:border-border/60 transition-all duration-150"
            aria-label="New chat"
            title="New Chat"
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-background relative">
        {activeView === "chat" ? (
          <>
            {/* Messages Area */}
            {messages.length > 0 ? (
              <div className="flex-1 overflow-y-auto relative">
                {/* Chat area background drag region - avoid button zones */}
                <div
                  className="absolute draglayer z-0"
                  style={{
                    top: "70px",
                    left: "0",
                    right: "0",
                    bottom: "0",
                  }}
                ></div>

                <div className="max-w-4xl mx-auto p-6 relative z-10">
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
              <div className="flex-1 flex items-center justify-center relative">
                {/* Welcome page background drag areas - multiple regions avoiding buttons */}

                {/* Top area - avoid both left and right button zones */}
                <div
                  className="absolute top-0 draglayer z-0"
                  style={{
                    left: sidebarCollapsed ? "120px" : "0",
                    right: "80px",
                    height: "70px",
                  }}
                ></div>

                {/* Main center area - full width below buttons */}
                <div
                  className="absolute draglayer z-0"
                  style={{
                    top: "70px",
                    left: "0",
                    right: "0",
                    bottom: "120px",
                  }}
                ></div>

                <div className="text-center space-y-6 max-w-md relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-pink-500 rounded-2xl flex items-center justify-center mx-auto">
                    <Sparkles size={32} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-foreground mb-2">
                      Welcome to Convera
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
            <div className="p-6 relative pointer-events-auto">
              <div className="max-w-4xl mx-auto relative z-10">
                <ChatInput
                  ref={chatInputRef}
                  hasMessages={messages.length > 0}
                  placeholder="Message Convera..."
                />
              </div>
            </div>
          </>
        ) : (
          /* Settings View - Content only, navigation is in sidebar */
          <div className="flex-1 overflow-y-auto">
            {renderSettingsContent()}
          </div>
        )}
      </div>
    </div>
  );
}
