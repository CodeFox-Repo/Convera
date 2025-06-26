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
  User,
  X,
} from "lucide-react";

// Import page components
import { AccountSettingsPage } from "@/renderer/components/settings/pages/account-page";
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
    {
      id: "account",
      label: "Account",
      icon: <User className="h-5 w-5" />,
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
      id: "app",
      label: "Apps",
      icon: <LayoutGrid className="h-5 w-5" />,
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
      case "account":
        return <AccountSettingsPage />;
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
    <div className="h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <div
        className={`bg-card border-r border-border transition-all duration-300 flex flex-col ${
          isSidebarCollapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            {!isSidebarCollapsed && (
              <h1 className="text-lg font-semibold text-foreground">
                Settings
              </h1>
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
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={
                  isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
                }
              >
                {isSidebarCollapsed ? (
                  <ChevronRight className="h-5 w-5" />
                ) : (
                  <ChevronLeft className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          <ul className="space-y-1 px-2">
            {navigationItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => handleTabChange(item.id)}
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

        {/* Close button */}
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

      {/* Mobile sidebar toggle */}
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
      <div className="flex-1 overflow-y-auto">{renderPageContent()}</div>
    </div>
  );
}
