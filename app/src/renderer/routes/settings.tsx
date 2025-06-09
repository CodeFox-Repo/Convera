import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Code,
  LayoutGrid,
  Moon,
  Plug,
  Server,
  Settings as SettingsIcon,
  Sun,
  X,
} from "lucide-react";

// Import our component tabs
import { AgentsTab } from "@/renderer/components/settings/agents-tab";
import { AIModelSection } from "@/renderer/components/settings/ai-model-section";
import { AppTab } from "@/renderer/components/settings/app-tab";
import { MarketplaceSection } from "@/renderer/components/settings/marketplace-tab";
import { ShortcutsSection } from "@/renderer/components/settings/shortcuts-section";
import { useWindowClose } from "@/renderer/libs/hooks/use-window-close";
import { useMcpStore } from "@/renderer/libs/stores/mcp-store";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import React, { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

/**
 * Settings page component that allows the user to configure OpenAI settings
 * and keyboard shortcuts.
 */
function SettingsPage() {
  // UI state only
  const [activeTab, setActiveTab] = useState<string>("general");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Refs for shortcut recording
  const shortcutInputRef = useRef<HTMLButtonElement>(null);
  const recordingStateRef = useRef<string>("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // MCP Store
  const {
    mcpMarketItems,
    loadingMarketplace,
    loadingMcpServers,
    mcpServers,
    installingTools,
    handleInstallPredefinedServer,
    handleInstallMcpTool,
    handleManualInstallMcp,
    handleUninstallPredefinedServer,
    refreshAll: refreshMcpData,
  } = useMcpStore();

  // Settings Store
  const {
    settings,
    settingsLoading,
    currentTheme,
    activeShortcut,
    recordingShortcut,
    devModeEnabled,
    experimentalFeatures,
    initializeSettings,
    handleOpenAIChange,
    handleAddSupportedModel,
    handleRemoveSupportedModel,
    handleResetShortcuts,
    handleToggleTheme,
    setActiveShortcut,
    setRecordingShortcut,
    saveRecordedShortcut,
    setDevModeEnabled,
    setExperimentalFeature,
    subscribeToSettingsChanges,
  } = useSettingsStore();

  // Initialize stores on component mount
  useEffect(() => {
    initializeSettings();

    // Initialize MCP store (it will load its own data)
    const mcpStore = useMcpStore.getState();
    mcpStore.refreshAll();

    // Subscribe to settings changes
    const unsubscribe = subscribeToSettingsChanges();
    return unsubscribe;
  }, []);

  // Handle Command+W for settings window
  useWindowClose({ type: "toggle", windowType: "settings" });

  // Callback functions for shortcut recording
  const saveRecordedShortcutCallback = useCallback(
    async (shortcutToSave: string) => {
      await saveRecordedShortcut(shortcutToSave);
      recordingStateRef.current = "";

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    },
    [saveRecordedShortcut],
  );

  const formatShortcut = (event: KeyboardEvent): string => {
    const parts: string[] = [];
    if (event.metaKey) parts.push("Command");
    if (event.ctrlKey) parts.push("Control");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");

    let key = "";

    if (event.key === " " || event.code === "Space") {
      key = "Space";
    } else if (event.code.startsWith("Key")) {
      key = event.code.replace("Key", "");
    } else if (event.key === "Dead") {
      key = "";
    } else if (event.code.startsWith("Digit")) {
      key = event.code.replace("Digit", "");
    } else if (event.code.startsWith("Numpad")) {
      key = event.code;
    } else if (event.code.startsWith("F") && /^F\d+$/.test(event.code)) {
      key = event.code;
    } else if (event.code.startsWith("Arrow")) {
      key = event.code.replace("Arrow", "") + "Arrow";
    } else if (
      !["Control", "Alt", "Shift", "Meta", "Command"].includes(event.key)
    ) {
      key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    }

    if (
      key &&
      !["CONTROL", "ALT", "SHIFT", "META", "COMMAND"].includes(
        key.toUpperCase(),
      )
    ) {
      parts.push(key);
    }

    return parts.join("+");
  };

  const handleRecordingKeyEvent = useCallback(
    (event: KeyboardEvent) => {
      if (!activeShortcut) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setActiveShortcut(null);
        recordingStateRef.current = "";
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        return;
      }

      if (event.type === "keydown") {
        const shortcutKeys = formatShortcut(event);
        setRecordingShortcut(shortcutKeys);

        const hasNonModifierKey =
          shortcutKeys &&
          !["Command", "Control", "Alt", "Shift"].includes(shortcutKeys) &&
          shortcutKeys
            .split("+")
            .some(
              (part) => !["Command", "Control", "Alt", "Shift"].includes(part),
            );

        if (hasNonModifierKey) {
          recordingStateRef.current = shortcutKeys;
          setRecordingShortcut(`${shortcutKeys} (release to save)`);

          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }

          saveTimeoutRef.current = setTimeout(() => {
            saveRecordedShortcutCallback(shortcutKeys);
          }, 1000);
        }
      } else if (event.type === "keyup") {
        const isNonModifierKey = !["Meta", "Control", "Alt", "Shift"].includes(
          event.key,
        );

        if (isNonModifierKey && recordingStateRef.current) {
          saveRecordedShortcutCallback(recordingStateRef.current);
        }
      }
    },
    [
      activeShortcut,
      saveRecordedShortcutCallback,
      setRecordingShortcut,
      setActiveShortcut,
    ],
  );

  // Shortcut Recording Logic
  const startRecording = (id: string) => {
    setActiveShortcut(id);
  };

  const handleCloseSettings = () => {
    try {
      if (window.electronAPI) {
        window.electronAPI.toggleWindow("settings").catch((error: unknown) => {
          console.error("Error toggling settings window:", error);
        });
      }
    } catch (error: unknown) {
      console.error("Error toggling settings window:", error);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  // Effect for keyboard event handling during shortcut recording
  useEffect(() => {
    if (activeShortcut) {
      window.addEventListener("keydown", handleRecordingKeyEvent, true);
      window.addEventListener("keyup", handleRecordingKeyEvent, true);

      setTimeout(() => {
        shortcutInputRef.current?.focus();
      }, 0);
    } else {
      window.removeEventListener("keydown", handleRecordingKeyEvent, true);
      window.removeEventListener("keyup", handleRecordingKeyEvent, true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    }

    return () => {
      window.removeEventListener("keydown", handleRecordingKeyEvent, true);
      window.removeEventListener("keyup", handleRecordingKeyEvent, true);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [activeShortcut, handleRecordingKeyEvent]);

  // Effect for click outside handling during shortcut recording
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        activeShortcut &&
        shortcutInputRef.current &&
        !shortcutInputRef.current.contains(event.target as Node)
      ) {
        setActiveShortcut(null);
        recordingStateRef.current = "";

        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
      }
    };

    if (activeShortcut) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [activeShortcut, setActiveShortcut]);

  // Early return if settings are still loading
  if (settingsLoading || !settings) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  const marketplaceProps = {
    loadingMarketplace,
    loadingMcpServers,
    mcpMarketItems,
    mcpServers,
    installingTools,
    onInstallPredefinedServer: handleInstallPredefinedServer,
    onInstallMcpTool: handleInstallMcpTool,
    onManualInstallMcp: handleManualInstallMcp,
    onUninstallPredefinedServer: handleUninstallPredefinedServer,
    onRefreshServers: refreshMcpData,
  };

  // Navigation items for sidebar
  const navigationItems = [
    {
      id: "general",
      label: "General",
      icon: <SettingsIcon className="h-5 w-5" />,
    },
    { id: "app", label: "Apps", icon: <Plug className="h-5 w-5" /> },
    { id: "mcp", label: "MCP Market", icon: <Server className="h-5 w-5" /> },
    { id: "agents", label: "Agents", icon: <LayoutGrid className="h-5 w-5" /> },
    { id: "developer", label: "Developer", icon: <Code className="h-5 w-5" /> },
  ];

  return (
    <div className="bg-background/20 relative h-full w-full flex overflow-hidden">
      {/* Sidebar */}
      <div
        className={`bg-card/90 h-full overflow-y-auto border-r border-border/40 flex flex-col transition-all duration-300 ${
          isSidebarCollapsed ? "w-16" : "w-64"
        }`}
      >
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          {!isSidebarCollapsed && (
            <h1 className="text-foreground text-lg font-bold">Settings</h1>
          )}
          <div className="flex items-center">
            {!isSidebarCollapsed && (
              <div
                className="no-drag-region hover:bg-foreground/10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors mr-2"
                onClick={handleToggleTheme}
                role="button"
                aria-label="Toggle theme"
              >
                {currentTheme === "dark" ? (
                  <Sun className="text-foreground/80 h-5 w-5" />
                ) : (
                  <Moon className="text-foreground/80 h-5 w-5" />
                )}
              </div>
            )}
            <button
              onClick={toggleSidebar}
              className="no-drag-region hover:bg-foreground/10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors"
              aria-label={
                isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="h-5 w-5 text-foreground/80" />
              ) : (
                <ChevronLeft className="h-5 w-5 text-foreground/80" />
              )}
            </button>
          </div>
        </div>

        <nav className="flex-1 py-4">
          <ul className="space-y-1 px-2">
            {navigationItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center w-full px-3 py-2 rounded-md transition-colors ${
                    activeTab === item.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-foreground/5 text-foreground/80"
                  } ${isSidebarCollapsed ? "justify-center" : ""}`}
                  title={isSidebarCollapsed ? item.label : undefined}
                >
                  <span className={isSidebarCollapsed ? "" : "mr-2"}>
                    {item.icon}
                  </span>
                  {!isSidebarCollapsed && <span>{item.label}</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-border/40 p-4">
          <button
            onClick={handleCloseSettings}
            className={`flex items-center text-foreground/80 hover:text-foreground/100 w-full ${
              isSidebarCollapsed ? "justify-center" : ""
            }`}
            title={isSidebarCollapsed ? "Close Settings" : undefined}
          >
            <X className={`h-5 w-5 ${isSidebarCollapsed ? "" : "mr-2"}`} />
            {!isSidebarCollapsed && <span>Close Settings</span>}
          </button>
        </div>
      </div>

      {/* Mobile sidebar toggle - only shown on small screens */}
      <div className="md:hidden fixed bottom-4 left-4 z-50">
        <button
          onClick={toggleSidebar}
          className="bg-primary text-primary-foreground w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
          aria-label={isSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* General Tab Content */}
        {activeTab === "general" && (
          <div className="space-y-8">
            <div>
              <AIModelSection
                settings={settings}
                onOpenAIChange={handleOpenAIChange}
                onAddSupportedModel={handleAddSupportedModel}
                onRemoveSupportedModel={handleRemoveSupportedModel}
              />
            </div>

            <div>
              <ShortcutsSection
                settings={settings}
                activeShortcut={activeShortcut}
                recordingShortcut={recordingShortcut}
                shortcutInputRef={
                  shortcutInputRef as React.RefObject<HTMLButtonElement>
                }
                onStartRecording={startRecording}
                onResetShortcuts={handleResetShortcuts}
              />
            </div>
          </div>
        )}

        {/* MCP Market Tab Content */}
        {activeTab === "mcp" && <MarketplaceSection {...marketplaceProps} />}

        {/* Agents Tab Content */}
        {activeTab === "agents" && (
          <AgentsTab onNavigateToMcp={() => setActiveTab("mcp")} />
        )}

        {/* App Tab Content */}
        {activeTab === "app" && <AppTab />}

        {/* Developer Tab Content */}
        {activeTab === "developer" && (
          <div className="space-y-6">
            {/* Developer Mode Section */}
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Developer Settings
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Development tools and debugging features
                </p>
              </div>

              <div className="border border-border rounded-lg">
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-foreground">
                        Developer Mode
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Enable debugging tools and window controls
                      </p>
                    </div>
                    <button
                      onClick={() => setDevModeEnabled(!devModeEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        devModeEnabled ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          devModeEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {devModeEnabled && (
                  <div className="p-4 space-y-4">
                    <div>
                      <h4 className="font-medium text-foreground mb-3">
                        Window Controls
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="border border-border rounded-md p-3">
                          <h5 className="font-medium text-sm mb-1">
                            Settings Window
                          </h5>
                          <p className="text-xs text-muted-foreground mb-2">
                            Configuration window
                          </p>
                          <button
                            onClick={() =>
                              window.electronAPI?.toggleWindow("settings")
                            }
                            className="w-full px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-md transition-colors"
                          >
                            Toggle Settings
                          </button>
                        </div>

                        <div className="border border-border rounded-md p-3">
                          <h5 className="font-medium text-sm mb-1">
                            History Window
                          </h5>
                          <p className="text-xs text-muted-foreground mb-2">
                            Chat history browser
                          </p>
                          <button
                            onClick={() =>
                              window.electronAPI?.toggleWindow("history")
                            }
                            className="w-full px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-md transition-colors"
                          >
                            Toggle History
                          </button>
                        </div>

                        <div className="border border-border rounded-md p-3">
                          <h5 className="font-medium text-sm mb-1">
                            Main Window
                          </h5>
                          <p className="text-xs text-muted-foreground mb-2">
                            Main application interface
                          </p>
                          <button
                            onClick={() =>
                              window.electronAPI?.toggleWindow("main")
                            }
                            className="w-full px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-md transition-colors"
                          >
                            Toggle Main Window
                          </button>
                        </div>

                        <div className="border border-border rounded-md p-3">
                          <h5 className="font-medium text-sm mb-1">
                            Agent Popover
                          </h5>
                          <p className="text-xs text-muted-foreground mb-2">
                            Agent selection popover
                          </p>
                          <button
                            onClick={(e) => {
                              const button = e.currentTarget;
                              const rect = button.getBoundingClientRect();
                              const x = rect.right + 10;
                              const y = rect.top;

                              window.electronAPI?.toggleAgentPopover(
                                Math.round(x),
                                Math.round(y),
                                280,
                                200,
                              );
                            }}
                            className="w-full px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-md transition-colors"
                          >
                            Toggle Agent Popover
                          </button>
                        </div>

                        <div className="border border-border rounded-md p-3">
                          <h5 className="font-medium text-sm mb-1">
                            Model Selector
                          </h5>
                          <p className="text-xs text-muted-foreground mb-2">
                            Model selection popover
                          </p>
                          <button
                            onClick={(e) => {
                              const button = e.currentTarget;
                              const rect = button.getBoundingClientRect();
                              const x = rect.right + 10;
                              const y = rect.top;

                              window.electronAPI?.toggleModelSelector(
                                Math.round(x),
                                Math.round(y),
                                280,
                                200,
                              );
                            }}
                            className="w-full px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-md transition-colors"
                          >
                            Toggle Model Selector
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border pt-3">
                      <p className="text-xs text-muted-foreground">
                        These controls are for development and debugging
                        purposes.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Experimental Features Section */}
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Experimental Features
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Features in development that may change or be removed
                </p>
              </div>

              <div className="border border-border rounded-lg">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-foreground">
                        Enable Main Window
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Show button in expanded view to open main window
                        interface
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setExperimentalFeature(
                          "enableMainWindow",
                          !experimentalFeatures.enableMainWindow,
                        )
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        experimentalFeatures.enableMainWindow
                          ? "bg-primary"
                          : "bg-muted"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          experimentalFeatures.enableMainWindow
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
