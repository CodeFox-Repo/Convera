import { createFileRoute, useRouter, useSearch } from "@tanstack/react-router";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Code,
  LayoutGrid,
  Moon,
  Server,
  Settings as SettingsIcon,
  Sun,
  X,
} from "lucide-react";
import {
  EnhancedDragRegion,
  SidebarDragRegion,
} from "@/renderer/components/ui/enhanced-drag-region";

// Import page components
// NOTE: AccountSettingsPage is deprecated - account functionality integrated into GeneralSettingsPage
// import { AccountSettingsPage } from "@/renderer/components/settings/pages/account-page";
import { AgentsSettingsPage } from "@/renderer/components/settings/pages/agents-page";
import { AppSettingsPage } from "@/renderer/components/settings/pages/app-page";
import { DeveloperSettingsPage } from "@/renderer/components/settings/pages/developer-page";
import { GeneralSettingsPage } from "@/renderer/components/settings/pages/general-page";
import { McpSettingsPage } from "@/renderer/components/settings/pages/mcp-page";

import { useWindowClose } from "@/renderer/libs/hooks/use-window-close";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import React, { useCallback, useState } from "react";
import { z } from "zod";

const settingsSchema = z.object({
  from: z.string().optional(),
  tab: z.string().optional().default("general"),
});

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  validateSearch: settingsSchema,
});

function SettingsPage() {
  const search = useSearch({ from: "/settings" });
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Get active tab from search params or default to general
  const activeTab = search.tab || "general";

  const { currentTheme, handleToggleTheme } = useSettingsStore();

  // Handle Command+W for settings window
  useWindowClose({ type: "toggle", windowType: "settings" });

  const handleCloseSettings = useCallback(() => {
    if (search.from) {
      router.navigate({ to: "/" });
    } else {
      window.electronAPI?.toggleWindow("settings");
    }
  }, [search.from, router]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  // Handle tab navigation
  const handleTabChange = useCallback(
    (tabId: string) => {
      router.navigate({
        to: "/settings",
        search: { ...search, tab: tabId },
      });
    },
    [router, search],
  );

  // Navigation items
  const navigationItems = [
    {
      id: "general",
      label: "General",
      icon: <SettingsIcon className="h-5 w-5" />,
    },
    // NOTE: Account tab removed - functionality integrated into General tab
    // {
    //   id: "account",
    //   label: "Account",
    //   icon: <User className="h-5 w-5" />,
    // },
    {
      id: "app",
      label: "Apps",
      icon: <LayoutGrid className="h-5 w-5" />,
    },
    {
      id: "agents",
      label: "Agents",
      icon: <Bot className="h-5 w-5" />,
    },
    {
      id: "mcp",
      label: "MCP Servers",
      icon: <Server className="h-5 w-5" />,
    },

    {
      id: "developer",
      label: "Developer",
      icon: <Code className="h-5 w-5" />,
    },
  ];

  // Render page content based on active tab
  const renderPageContent = () => {
    switch (activeTab) {
      case "general":
        return <GeneralSettingsPage />;
      // NOTE: Account case removed - functionality integrated into General tab
      // case "account":
      //   return <AccountSettingsPage />;
      case "agents":
        return (
          <AgentsSettingsPage onNavigateToMcp={() => handleTabChange("mcp")} />
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
    <div className="h-screen flex bg-gradient-to-br from-background via-background to-muted/20 relative">
      {/* Drag regions for all edges */}
      <EnhancedDragRegion position="top" size={24} />
      <EnhancedDragRegion position="bottom" size={24} />
      <EnhancedDragRegion position="left" size={24} />
      <EnhancedDragRegion position="right" size={24} />

      {/* Sidebar */}
      <SidebarDragRegion
        className={`bg-gradient-to-b from-card/95 via-card to-card/95 backdrop-blur-xl border-r border-border/50 transition-all duration-300 flex flex-col ${
          isSidebarCollapsed ? "w-20" : "w-72"
        }`}
      >
        {/* Header */}
        <div className="p-6 border-b border-border/30 relative">
          {/* Drag whitespace area */}
          <div className="drag-whitespace absolute inset-0 pointer-events-none"></div>

          <div className="flex items-center justify-between relative z-10">
            {!isSidebarCollapsed && (
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 flex items-center justify-center">
                  <img
                    src="./images/logo.png"
                    alt="FoxyChat Logo"
                    className="w-8 h-8"
                  />
                </div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  FoxyChat
                </h1>
              </div>
            )}
            <div className="flex items-center space-x-2">
              {!isSidebarCollapsed && (
                <button
                  className="no-drag-region group relative overflow-hidden hover:bg-gradient-to-r hover:from-primary/10 hover:to-primary/5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl transition-all duration-200 border border-border/30 hover:border-primary/30 pointer-events-auto"
                  onClick={handleToggleTheme}
                  role="button"
                  aria-label="Toggle theme"
                >
                  <div className="relative z-10">
                    {currentTheme === "dark" ? (
                      <Sun className="text-foreground/70 group-hover:text-primary h-4 w-4 transition-colors" />
                    ) : (
                      <Moon className="text-foreground/70 group-hover:text-primary h-4 w-4 transition-colors" />
                    )}
                  </div>
                </button>
              )}
              <button
                onClick={toggleSidebar}
                className="group hover:bg-gradient-to-r hover:from-muted/50 hover:to-muted/20 p-2 rounded-xl transition-all duration-200 border border-border/30 hover:border-border/50 pointer-events-auto"
                aria-label={
                  isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
                }
              >
                {isSidebarCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                ) : (
                  <ChevronLeft className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 px-4 relative">
          {/* Drag whitespace area */}
          <div className="drag-whitespace absolute inset-0 pointer-events-none"></div>

          <ul className="space-y-2 relative z-10">
            {navigationItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => handleTabChange(item.id)}
                  className={`group relative overflow-hidden flex items-center w-full px-4 py-3 rounded-xl transition-all duration-200 pointer-events-auto ${
                    activeTab === item.id
                      ? "bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 text-primary font-semibold border border-primary/20"
                      : "hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/20 text-foreground/70 hover:text-foreground border border-transparent hover:border-border/30"
                  } ${isSidebarCollapsed ? "justify-center" : ""}`}
                  title={isSidebarCollapsed ? item.label : undefined}
                >
                  {activeTab === item.id && (
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 rounded-xl" />
                  )}
                  <span
                    className={`relative z-10 ${isSidebarCollapsed ? "" : "mr-3"} ${
                      activeTab === item.id ? "text-primary" : ""
                    }`}
                  >
                    {item.icon}
                  </span>
                  {!isSidebarCollapsed && (
                    <span className="relative z-10 font-medium">
                      {item.label}
                    </span>
                  )}
                  {activeTab === item.id && !isSidebarCollapsed && (
                    <div className="absolute right-3 w-2 h-2 bg-primary rounded-full" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Close button */}
        <div className="border-t border-border/30 p-4 relative">
          {/* Drag whitespace area */}
          <div className="drag-whitespace absolute inset-0 pointer-events-none"></div>

          <button
            onClick={handleCloseSettings}
            className={`group flex items-center text-foreground/60 hover:text-foreground/90 w-full px-4 py-3 rounded-xl hover:bg-gradient-to-r hover:from-red-500/10 hover:to-red-500/5 border border-transparent hover:border-red-500/20 transition-all duration-200 pointer-events-auto relative z-10 ${
              isSidebarCollapsed ? "justify-center" : ""
            }`}
            title={isSidebarCollapsed ? "Close Settings" : undefined}
          >
            <X
              className={`h-5 w-5 group-hover:text-red-500 transition-colors ${isSidebarCollapsed ? "" : "mr-3"}`}
            />
            {!isSidebarCollapsed && (
              <span className="font-medium">Close Settings</span>
            )}
          </button>
        </div>
      </SidebarDragRegion>

      {/* Mobile sidebar toggle */}
      <div className="md:hidden fixed bottom-6 left-6 z-50">
        <button
          onClick={toggleSidebar}
          className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground w-12 h-12 rounded-2xl flex items-center justify-center border border-primary/20 transition-all duration-200"
          aria-label={isSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="h-6 w-6" />
          ) : (
            <ChevronLeft className="h-6 w-6" />
          )}
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-background/80 to-background backdrop-blur-sm">
        {renderPageContent()}
      </div>
    </div>
  );
}
