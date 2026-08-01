import { BaseLogo } from "@/renderer/components/common/base-logo";
import { useAgentStore } from "@/renderer/libs/stores/agent-store";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  Hash,
  Inbox as InboxIcon,
  Lock,
  Moon,
  Server,
  Settings,
  Store,
  Sun,
  Users,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChannelHeader, ChannelRoster } from "../chat/ChannelHeader";
import { AgentContextPanel } from "../chat/AgentContextPanel";
import { TypingIndicator } from "../chat/TypingIndicator";
import { InboxPage } from "../inbox/InboxPage";
import ChatInputContainer from "../chat/input/chat-input-container";
import type { ChatInputRef } from "../chat/input/chat-input-container";
import ChatContent from "../chat/message/chat-content";
import {
  EnhancedDragRegion,
  SidebarDragRegion,
} from "../ui/enhanced-drag-region";

// Import settings pages
import { AgentsSettingsPage } from "@/renderer/components/settings/pages/agents-page";
import { GeneralSettingsPage } from "@/renderer/components/settings/pages/general-page";
import { McpSettingsPage } from "@/renderer/components/settings/pages/mcp-page";
import { OrgRosterPage } from "@/renderer/components/talent/OrgRosterPage";
import { TalentMarketPage } from "@/renderer/components/talent/TalentMarketPage";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import {
  useWorkspaceUI,
  type SettingsTab,
} from "@/renderer/libs/stores/workspace-ui-context";

// Import conversation list and search components
import {
  WorkspaceSidebar,
  WorkspaceUserRow,
} from "@/renderer/components/sidebar/WorkspaceSidebar";
import { WorkspaceTitle } from "@/renderer/components/sidebar/WorkspaceTitle";
import { GlobalSearchDialog } from "@/renderer/components/search/GlobalSearchDialog";
import {
  useSearchUIState,
  useSelectionStore,
} from "@/renderer/libs/db/ui-state";
import { useKeyboardShortcut } from "@/renderer/libs/hooks/use-keyboard-shortcut";
import { branchConversationWithRuntime } from "@/renderer/libs/conversation-lifecycle";
import { useAgent, useConversation } from "@/renderer/libs/db/hooks";
import { useChannelByConversationId } from "@/renderer/libs/stores/channel-store";
import { useMembers } from "@/renderer/libs/stores/member-store";
import {
  composeChannelAgentLine,
  composeInputPlaceholder,
} from "@/renderer/libs/chat-labels";

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
    setReplyTarget,
  } = useChatContext();

  const { agentChanged, handleAgentChange, selectedAgent } = useAgentStore();
  const { currentTheme, handleToggleTheme } = useSettingsStore();
  const { openSearch } = useSearchUIState();
  const { currentConversationId, setCurrentConversation } = useSelectionStore();

  // Who this conversation is addressed to — a channel, or the agent behind it.
  const currentChannel = useChannelByConversationId(currentConversationId);
  const currentConversation = useConversation(currentConversationId);
  const conversationAgent = useAgent(currentConversation?.agentId ?? null);
  const inputPlaceholder = composeInputPlaceholder({
    channelName: currentChannel?.name,
    agentName: conversationAgent?.name ?? selectedAgent?.name ?? null,
  });

  const ChannelGlyph = currentChannel?.isPrivate ? Lock : Hash;

  const allMembers = useMembers();
  const channelAgentLine = useMemo(() => {
    if (!currentChannel) return null;
    const byId = new Map((allMembers ?? []).map((m) => [m.id, m]));
    return composeChannelAgentLine(
      currentChannel.memberIds.flatMap((id) => {
        const member = byId.get(id);
        return member?.kind === "agent" ? [member.name] : [];
      }),
    );
  }, [currentChannel, allMembers]);

  // Where the user was standing — one context owns all of it.
  const {
    view: activeView,
    setView: setActiveView,
    settingsTab: activeSettingsTab,
    setSettingsTab: setActiveSettingsTab,
    sidebarWidth,
    setSidebarWidth,
  } = useWorkspaceUI();
  const [rosterOpen, setRosterOpen] = useState(false);
  const [agentContextOpen, setAgentContextOpen] = useState(false);
  const resizingRef = useRef(false);

  useEffect(() => {
    setRosterOpen(false);
    setAgentContextOpen(false);
  }, [currentConversationId]);

  const startSidebarResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    resizingRef.current = true;
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      setSidebarWidth(e.clientX);
    };
    const onUp = (e: MouseEvent) => {
      resizingRef.current = false;
      setSidebarWidth(e.clientX);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // Global search keyboard shortcut (Cmd+K / Ctrl+K)
  useKeyboardShortcut({
    key: "k",
    metaKey: true,
    callback: openSearch,
  });

  // Helper to navigate to settings - auto-expands sidebar
  const navigateToSettings = useCallback(() => {
    setActiveView("settings");
  }, []);

  // Listen for navigate-to-settings from main process (tray menu)
  useEffect(() => {
    window.electronAPI?.onNavigateToSettings?.(navigateToSettings);
  }, [navigateToSettings]);

  const handleNewChat = () => {
    resetChat();
    setActiveView("chat");
  };

  // Handle branching from a specific message
  const handleBranchFromMessage = async (messageIndex: number) => {
    if (!currentConversationId) {
      console.error("Cannot branch: no current conversation");
      return;
    }

    try {
      const newConversationId = await branchConversationWithRuntime(
        currentConversationId,
        messageIndex,
      );
      // Switch to the new branched conversation
      setCurrentConversation(newConversationId);
      console.log("Created branch conversation:", newConversationId);
    } catch (error) {
      console.error("Failed to create branch:", error);
    }
  };

  // Settings navigation items
  const settingsNavItems = [
    { id: "general" as SettingsTab, label: "General", icon: Settings },
    { id: "agents" as SettingsTab, label: "Agents", icon: Bot },
    { id: "talent" as SettingsTab, label: "Talent Market", icon: Store },
    { id: "org" as SettingsTab, label: "Org", icon: Users },
    { id: "mcp" as SettingsTab, label: "MCP Servers", icon: Server },
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
      case "talent":
        return <TalentMarketPage />;
      case "org":
        return <OrgRosterPage />;
      case "mcp":
        return <McpSettingsPage />;
      default:
        return <GeneralSettingsPage />;
    }
  };

  return (
    <div className="h-screen w-full flex bg-transparent relative">
      {/* Drag regions for all edges */}
      <EnhancedDragRegion top={24} bottom={24} left={24} right={24} />

      {/* Sidebar */}
      <div
        className="bg-sidebar text-sidebar-foreground backdrop-blur-md flex flex-shrink-0 flex-col overflow-hidden"
        style={{ width: sidebarWidth }}
      >
        <SidebarDragRegion className="flex-1 flex flex-col h-full">
          {/* Sidebar Header */}
          {
            <div className="px-3 pb-1">
              {/* Traffic-light clearance — the OS buttons live in this strip.
                  Just tall enough to clear them; a full row of height above
                  the workspace name read as a rendering gap. */}
              <div className="h-5" />
              {/* Workspace row: identity on the left, its actions on the right */}
              <div className="flex items-center gap-2 h-8">
                {activeView !== "settings" ? (
                  <WorkspaceTitle
                    onManageAgents={() => {
                      setActiveView("settings");
                      setActiveSettingsTab("agents");
                    }}
                  />
                ) : (
                  <>
                    <button
                      onClick={() => setActiveView("chat")}
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground transition-colors pointer-events-auto"
                      aria-label="Back to chat"
                      title="Back to Chat"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-sidebar-foreground">
                      Settings
                    </h1>
                  </>
                )}
                {activeView !== "settings" ? null : (
                  <button
                    onClick={handleToggleTheme}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground transition-colors pointer-events-auto"
                    title="Toggle theme"
                  >
                    {currentTheme === "dark" ? (
                      <Sun size={14} />
                    ) : (
                      <Moon size={14} />
                    )}
                  </button>
                )}
              </div>

              {/* Inbox: unread + mentions across the workspace */}
              {activeView !== "settings" && (
                <button
                  onClick={() =>
                    setActiveView(activeView === "inbox" ? "chat" : "inbox")
                  }
                  className={`mt-1.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors pointer-events-auto ${
                    activeView === "inbox"
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground"
                  }`}
                  aria-label="Inbox"
                >
                  <InboxIcon size={14} className="flex-shrink-0" />
                  <span className="flex-1 truncate">Inbox</span>
                </button>
              )}

              {/* Agents sits beside Inbox: both are workspace-wide views, not
                  a room you talk in. */}
              {activeView !== "settings" && (
                <button
                  onClick={() =>
                    setActiveView(activeView === "agents" ? "chat" : "agents")
                  }
                  className={`mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors pointer-events-auto ${
                    activeView === "agents"
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground"
                  }`}
                  aria-label="Agents"
                >
                  <Bot size={14} className="flex-shrink-0" />
                  <span className="flex-1 truncate">Agents</span>
                </button>
              )}

              {/* The search bar row is hidden for now; ⌘K still opens the
                  dialog, so the capability is intact without the chrome. */}
            </div>
          }

          {/* Sidebar Content */}
          <div className="flex-1 min-h-0 flex flex-col px-2">
            {/* Workspace: groups, channels, legacy conversations (chat view) */}
            {activeView !== "settings" && (
              <WorkspaceSidebar onNewChat={handleNewChat} />
            )}

            {/* Settings Navigation */}
            {activeView === "settings" && (
              <nav className="space-y-1 overflow-y-auto">
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
          {
            <div className="border-t border-sidebar-border p-2 flex-shrink-0 relative z-10">
              {/* Drag whitespace area */}
              <div className="drag-whitespace absolute inset-0 pointer-events-none"></div>

              <div className="relative z-10 px-1">
                {activeView !== "settings" && (
                  // The identity row IS the settings entry — click it, like
                  // Discord's user pill. No separate menu rows.
                  <WorkspaceUserRow onClick={navigateToSettings} />
                )}
              </div>
            </div>
          }
        </SidebarDragRegion>
      </div>

      {/* Divider: drag to resize the sidebar. Wider hit area than its 1px look. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={startSidebarResize}
        className="group/divider relative z-20 -mx-1 w-2 flex-shrink-0 cursor-col-resize pointer-events-auto"
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover/divider:bg-ring" />
      </div>

      {/* Main Content Area — plus the roster as a real second column, so
          opening it narrows the transcript instead of covering it. */}
      <div className="flex-1 flex min-w-0">
        <div className="flex-1 flex flex-col bg-background relative min-w-0">
          {activeView === "inbox" ? (
            <InboxPage
              onOpenConversation={(conversationId) => {
                setCurrentConversation(conversationId);
                setActiveView("chat");
              }}
            />
          ) : activeView === "agents" ? (
            <div className="flex-1 overflow-y-auto">
              <AgentsSettingsPage
                onNavigateToMcp={() => {
                  setActiveView("settings");
                  setActiveSettingsTab("mcp");
                }}
              />
            </div>
          ) : activeView === "chat" ? (
            <>
              {currentChannel && (
                <ChannelHeader
                  // Remount per room: the description editor holds draft text
                  // in state, and without a key a switch mid-edit would write
                  // one channel's description onto another.
                  key={currentChannel.id}
                  channel={currentChannel}
                  rosterOpen={rosterOpen}
                  onToggleRoster={() => {
                    setAgentContextOpen(false);
                    setRosterOpen((open) => !open);
                  }}
                  contextOpen={agentContextOpen}
                  onToggleContext={() => {
                    setRosterOpen(false);
                    setAgentContextOpen((open) => !open);
                  }}
                />
              )}

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

                  <div className="w-full py-4 relative z-10">
                    <ChatContent
                      showReactions={!!currentChannel}
                      messages={messages}
                      messagesEndRef={messagesEndRef}
                      isLoading={isLoading}
                      onEditMessage={editMessage}
                      onRegenerateMessage={regenerateMessage}
                      onReplyToMessage={(message) => {
                        setReplyTarget(message.id);
                        chatInputRef.current?.focus();
                      }}
                      onBranchFromMessage={handleBranchFromMessage}
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
                      left: "0",
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
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto">
                      {currentChannel ? (
                        <ChannelGlyph
                          size={48}
                          className="text-muted-foreground"
                        />
                      ) : (
                        <BaseLogo size={64} />
                      )}
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-foreground mb-2">
                        {currentChannel
                          ? `Welcome to #${currentChannel.name}`
                          : "Welcome to Convera"}
                      </h3>
                      <p className="text-muted-foreground">
                        {currentChannel
                          ? `This is the start of #${currentChannel.name}.`
                          : "Start a conversation by typing a message below"}
                      </p>
                      {channelAgentLine && (
                        <p className="text-muted-foreground mt-1">
                          {channelAgentLine}
                        </p>
                      )}
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
                    className="px-4 mb-3"
                  >
                    <div>
                      <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                        <p className="text-destructive text-sm">
                          {error.message ||
                            "Something went wrong. Please try again."}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Input Area */}
              <div className="px-4 pb-4 relative pointer-events-auto">
                <div className="relative z-10">
                  <TypingIndicator conversationId={currentConversationId} />
                  <ChatInputContainer
                    ref={chatInputRef}
                    placeholder={inputPlaceholder}
                    variant={currentChannel ? "channel" : "chat"}
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
        {activeView === "chat" && currentChannel && rosterOpen && (
          <ChannelRoster
            channel={currentChannel}
            onClose={() => setRosterOpen(false)}
          />
        )}
        <AnimatePresence>
          {activeView === "chat" &&
            currentChannel?.kind === "dm" &&
            agentContextOpen && (
              <AgentContextPanel
                channelId={currentChannel.id}
                onClose={() => setAgentContextOpen(false)}
              />
            )}
        </AnimatePresence>
      </div>

      {/* Global Search Dialog */}
      <GlobalSearchDialog
        onConversationSelect={() => {
          setActiveView("chat");
        }}
      />
    </div>
  );
}
