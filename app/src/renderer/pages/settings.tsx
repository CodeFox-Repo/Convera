/* eslint-disable @typescript-eslint/no-unused-vars */

import { getCurrentTheme, toggleTheme } from "@/renderer/libs/helper/theme_helpers";
import { ErrorCode } from "@/renderer/libs/utils/error-handler";
import {
  getSettings,
  resetShortcutsToDefault,
  updateOpenAISettings,
  updateShortcut,
} from "@/renderer/libs/utils/settings";
import type { MCPServerConfig, ToolDefinition } from "@/server/mcp/types";
import {
  AppSettings,
  McpMarketplaceItem,
  MCPServer,
} from "@/shared/types/settings";
import { ToolSet } from "ai";
import { ChevronLeft, ChevronRight, LayoutGrid, Moon, Server, Settings as SettingsIcon, Sun, X } from "lucide-react";
import { toast } from "sonner";

// Import our component tabs
import { AgentsTab } from "@/renderer/components/settings/agents-tab";
import { AIModelSection } from "@/renderer/components/settings/ai-model-section";
import { MarketplaceSection } from "@/renderer/components/settings/marketplace-tab";
import { ShortcutsSection } from "@/renderer/components/settings/shortcuts-section";
import React, { useCallback, useEffect, useRef, useState } from "react";

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: (tools: string[]) => string;
  tools: ToolSet;
  modelId?: string;
  iconUrl?: string;
  category?: string;
  avatar?: string;
  type?: string;
}

/**
 * Settings page component that allows the user to configure OpenAI settings
 * and keyboard shortcuts.
 */
export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [recordingShortcut, setRecordingShortcut] = useState<string>("");
  const shortcutInputRef = useRef<HTMLButtonElement>(null);
  const [mcpMarketItems, setMcpMarketItems] = useState<McpMarketplaceItem[]>(
    [],
  );
  const [loadingMarketplace, setLoadingMarketplace] = useState<boolean>(true);
  const [activeShortcut, setActiveShortcut] = useState<string | null>(null);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [loadingMcpServers, setLoadingMcpServers] = useState<boolean>(true);
  const [installingTools, setInstallingTools] = useState<
    Record<string, boolean>
  >({});
  const [mcpServerConfigs, setMcpServerConfigs] = useState<
    Record<string, MCPServerConfig>
  >({});
  // TODO(Sma1lboy): remove this config
  const [loadingMcpConfigs, setLoadingMcpConfigs] = useState<boolean>(true);
  const [currentTheme, setCurrentTheme] = useState<string>("light");
  const [mcpServerTools, setMcpServerTools] = useState<
    Record<string, ToolDefinition[]>
  >({});
  const [loadingMcpTools, setLoadingMcpTools] = useState<
    Record<string, boolean>
  >({});
  const [activeTab, setActiveTab] = useState<string>("general");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Add effect to listen for model selection changes
  useEffect(() => {
    const handleModelSelected = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.modelId) {
        const newModelId = customEvent.detail.modelId;
        const updatedOpenAI = {
          ...settings.openai,
          modelId: newModelId,
        };
        const updated = updateOpenAISettings(updatedOpenAI);
        setSettings(updated);
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "selectedModelId" && event.newValue) {
        const updatedOpenAI = {
          ...settings.openai,
          modelId: event.newValue,
        };
        const updated = updateOpenAISettings(updatedOpenAI);
        setSettings(updated);
      }
    };

    window.addEventListener("model-selected", handleModelSelected);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("model-selected", handleModelSelected);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [settings.openai]);

  useEffect(() => {
    setSettings(getSettings());
    fetchMcpMarketplace();
    fetchMcpConfigurations();
    fetchAllMcpServers();

    const fetchTheme = async () => {
      try {
        const { system } = await getCurrentTheme();
        setCurrentTheme(system);
      } catch (error) {
        console.error("Error fetching current theme:", error);
      }
    };

    fetchTheme();
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const fetchAllMcpServers = async () => {
    setLoadingMcpServers(true);
    try {
      const [predefinedResponse, installedResponse] = await Promise.all([
        fetch("http://localhost:38000/api/mcp/predefined-servers"),
        fetch("http://localhost:38000/api/mcp/installed-servers"),
      ]);

      if (!predefinedResponse.ok || !installedResponse.ok) {
        throw new Error("Failed to fetch MCP servers");
      }

      const predefinedData = await predefinedResponse.json();
      const installedData = await installedResponse.json();

      if (
        predefinedData.status === "success" &&
        installedData.status === "success"
      ) {
        const predefinedServers = predefinedData.servers || [];
        const installedServers = installedData.servers || [];

        const mergedServers: MCPServer[] = [];

        mergedServers.push(...installedServers);

        predefinedServers.forEach((server: MCPServer) => {
          if (!server.isInstalled) {
            mergedServers.push(server);
          }
        });

        setMcpServers(mergedServers);
      } else {
        throw new Error("Failed to fetch MCP servers data");
      }
    } catch (error) {
      console.error("Error fetching MCP servers:", error);
      toast.error("Failed to load MCP server data");
      setMcpServers([]); // Reset on error
    } finally {
      setLoadingMcpServers(false);
    }
  };

  const fetchMcpMarketplace = async () => {
    setLoadingMarketplace(true);
    try {
      const response = await fetch(
        "http://localhost:38000/api/mcp/marketplace",
      );
      if (!response.ok) {
        throw new Error("Failed to fetch marketplace data");
      }
      const data = await response.json();
      setMcpMarketItems(data.catalog?.items || []);
    } catch (error) {
      console.error("Error fetching MCP marketplace:", error);
      toast.error("Failed to load MCP marketplace data");
    } finally {
      setLoadingMarketplace(false);
    }
  };

  const fetchMcpConfigurations = async () => {
    setLoadingMcpConfigs(true);
    try {
      const response = await fetch(
        "http://localhost:38000/api/mcp/configurations",
      );
      if (!response.ok) {
        throw new Error("Failed to fetch MCP configurations");
      }
      const data = await response.json();
      if (data.status === "success") {
        setMcpServerConfigs(data.configurations || {});
      } else {
        throw new Error(data.message || "Failed to fetch MCP configurations");
      }
    } catch (error) {
      console.error("Error fetching MCP configurations:", error);
      toast.error("Failed to load MCP configurations");
      setMcpServerConfigs({}); // Reset on error
    } finally {
      setLoadingMcpConfigs(false);
    }
  };

  const handleInstallPredefinedServer = async (serverId: string) => {
    setInstallingTools((prev) => ({ ...prev, [serverId]: true }));
    try {
      const response = await fetch(
        "http://localhost:38000/api/mcp/predefined-servers/install",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: serverId }),
        },
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Failed to install server" }));
        throw new Error(errorData.message || "Failed to install server");
      }

      toast.success(`Server ${serverId} installed successfully`);
      fetchAllMcpServers(); // 刷新服务器列表
      fetchMcpConfigurations(); // 刷新配置
    } catch (error) {
      console.error(`Error installing server ${serverId}:`, error);
      toast.error(
        `Failed to install server: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setInstallingTools((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  const handleUninstallPredefinedServer = async (
    serverId: string,
  ): Promise<void> => {
    try {
      // Call the new API endpoint to uninstall the server
      const response = await fetch(
        "http://localhost:38000/api/mcp/predefined-servers/uninstall",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: serverId }),
        },
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Failed to uninstall server" }));
        throw new Error(errorData.message || "Failed to uninstall server");
      }

      toast.success(`Server ${serverId} uninstalled successfully`);

      // 刷新数据
      fetchAllMcpServers();
      fetchMcpConfigurations();
    } catch (error) {
      console.error(`Error uninstalling server ${serverId}:`, error);
      toast.error(
        `Failed to uninstall server: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error; // Re-throw to let the UI handle the error state
    }
  };

  const handleOpenAIChange = (field: string, value: string) => {
    const updatedOpenAI = {
      ...settings.openai,
      [field]: value,
    };
    
    // Validate API key format if that's the field being changed
    if (field === 'apiKey' && value.trim()) {
      // Make sure it doesn't already have a Bearer prefix
      if (value.startsWith('Bearer ')) {
        toast.warning('Please enter the API key without "Bearer" prefix', {
          id: ErrorCode.AUTH_INVALID_KEY
        });
        return;
      }
      
      // For OpenRouter API keys, they typically have a specific format
      // This is just a simple check, you might want to add more specific validation
      if (updatedOpenAI.endpoint.includes('openrouter.ai') && !value.match(/^[a-zA-Z0-9_-]{10,}/)) {
        toast.warning('This doesn\'t appear to be a valid API key format', {
          id: ErrorCode.AUTH_INVALID_KEY
        });
        // Continue anyway, as it might be a valid format we don't recognize
      }
    }
    
    const updated = updateOpenAISettings(updatedOpenAI);
    setSettings(updated);

    // Event handling for different fields
    if (field === "modelId") {
      // Dispatch model-selected event
      window.dispatchEvent(
        new CustomEvent("model-selected", {
          detail: { modelId: value },
        })
      );
      // Update localStorage
      localStorage.setItem("selectedModelId", value);
      toast.success("Model updated. Settings saved.", {
        id: 'settings-saved'
      });
    } else if (field === 'apiKey') {
      toast.success("API key saved. This will be used for authentication.", {
        id: 'api-key-updated'
      });
    } else {
      toast.success("Settings saved", {
        id: 'settings-saved'
      });
    }
    
    // Dispatch an event so other components know the settings changed
    window.dispatchEvent(new CustomEvent('settings-updated', { 
      detail: { field, value } 
    }));
  };

  const handleAddSupportedModel = (model: string) => {
    if (!model.trim()) return;

    if (settings.openai.supportedModels.includes(model)) {
      toast.error("Model already in the list");
      return;
    }

    const updatedSupportedModels = [...settings.openai.supportedModels, model];
    const updatedOpenAI = {
      ...settings.openai,
      supportedModels: updatedSupportedModels,
    };

    const updated = updateOpenAISettings(updatedOpenAI);
    setSettings(updated);
    toast.success("Model added to supported list");
  };

  const handleRemoveSupportedModel = (model: string) => {
    const updatedSupportedModels = settings.openai.supportedModels.filter(
      (m) => m !== model,
    );

    const updatedOpenAI = {
      ...settings.openai,
      supportedModels: updatedSupportedModels,
    };

    const updated = updateOpenAISettings(updatedOpenAI);
    setSettings(updated);
    toast.success("Model removed from supported list");
  };

  const handleResetShortcuts = () => {
    const updated = resetShortcutsToDefault();
    setSettings(updated);
    toast.success("Shortcuts reset to default");
  };

  // --- Shortcut Recording Logic ---
  const formatShortcut = (event: KeyboardEvent): string => {
    const parts: string[] = [];
    if (event.metaKey) parts.push("Command");
    if (event.ctrlKey) parts.push("Control");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");

    // Handle specific key names
    let key = event.key.toUpperCase();
    if (key === " ") key = "Space";
    else if (key === "CONTROL")
      key = "Control"; // Avoid duplicate Control
    else if (key === "ALT")
      key = "Alt"; // Avoid duplicate Alt
    else if (key === "SHIFT")
      key = "Shift"; // Avoid duplicate Shift
    else if (key === "META")
      key = "Command"; // Avoid duplicate Command/Meta
    else if (key.length === 1 && /[A-Z0-9]/.test(key)) {
      // Standard keys
      parts.push(key);
    } else if (!["CONTROL", "ALT", "SHIFT", "META", "COMMAND"].includes(key)) {
      // Other keys like ArrowUp, F1, etc.
      parts.push(event.key); // Use original case for special keys if needed
    }

    return parts.join("+");
  };

  const handleShortcutKeyDown = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const newShortcutKeys = formatShortcut(event);
      setRecordingShortcut(newShortcutKeys);

      // If key is released and it's not just a modifier key press
      if (
        newShortcutKeys &&
        !["Command", "Control", "Alt", "Shift"].includes(newShortcutKeys)
      ) {
        if (activeShortcut) {
          const shortcut = settings.shortcuts.find(
            (s) => s.id === activeShortcut,
          );
          if (shortcut) {
            const updated = updateShortcut({
              ...shortcut,
              shortcut: newShortcutKeys,
            });
            setSettings(updated);
            toast.success("Shortcut updated");
          }
          setActiveShortcut(null);
          setRecordingShortcut("");
          window.removeEventListener("keydown", handleShortcutKeyDown, true);
        }
      }
    },
    [activeShortcut, settings],
  );

  const startRecording = (id: string) => {
    setActiveShortcut(id);
    setRecordingShortcut("Recording...");
    // Use capture phase to prevent other handlers
    window.addEventListener("keydown", handleShortcutKeyDown, true);
    // Optionally focus a hidden element or the button itself to ensure capture
    shortcutInputRef.current?.focus();
  };

  // Handle click outside to cancel recording
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        activeShortcut &&
        shortcutInputRef.current &&
        !shortcutInputRef.current.contains(event.target as Node)
      ) {
        console.log("Clicked outside, cancelling recording");
        setActiveShortcut(null);
        setRecordingShortcut("");
        window.removeEventListener("keydown", handleShortcutKeyDown, true);
      }
    };

    if (activeShortcut) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      // Ensure keydown listener is removed on unmount or when editing stops
      window.removeEventListener("keydown", handleShortcutKeyDown, true);
    };
  }, [activeShortcut, handleShortcutKeyDown]);
  // --- End Shortcut Recording Logic ---

  const handleCloseSettings = () => {
    try {
      if (window.electronAPI) {
        console.log("Hiding settings window...");
        window.electronAPI
          .closeSettingsWindow()
          .then(() => {
            console.log("Settings window hidden successfully");
          })
          .catch((error) => {
            console.error("Error hiding settings window:", error);
            toast.error("Failed to hide settings window");
          });
      } else {
        console.error("electronAPI is not available!");
        toast.error("Failed to hide settings window: API not available");
      }
    } catch (error) {
      console.error("Error hiding settings window:", error);
      toast.error("Failed to hide settings window");
    }
  };

  const handleInstallMcpTool = async (tool: McpMarketplaceItem) => {
    if (installingTools[tool.mcpId]) return; // Already installing

    setInstallingTools((prev) => ({ ...prev, [tool.mcpId]: true }));

    try {
      // This is a placeholder. In a real implementation, you would call an API endpoint
      // to install the MCP tool on the backend
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate installation delay

      toast.success(`Installed ${tool.name} successfully`);
    } catch (error) {
      console.error(`Error installing ${tool.name}:`, error);
      toast.error(`Failed to install ${tool.name}`);
    } finally {
      setInstallingTools((prev) => ({ ...prev, [tool.mcpId]: false }));
    }
  };

  // Handle manual installation of MCP config
  const handleManualInstallMcp = async (configJson: string) => {
    try {
      // Parse and validate the config JSON
      let config;
      try {
        config = JSON.parse(configJson);
      } catch (e) {
        toast.error("Invalid JSON format");
        throw new Error("Invalid JSON format");
      }

      // Check if the config has the expected structure
      if (!config.mcpServers || typeof config.mcpServers !== "object") {
        toast.error("Invalid configuration: missing 'mcpServers' object");
        throw new Error("Invalid configuration structure");
      }

      // Submit the config to the backend
      const response = await fetch(
        "http://localhost:38000/api/mcp/configurations/manual",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to install MCP configuration",
        );
      }

      toast.success("MCP configuration installed successfully");
      fetchAllMcpServers(); // Immediately refresh installed servers
      fetchMcpConfigurations(); // Refresh configurations
    } catch (error) {
      console.error("Error installing manual MCP configuration:", error);
      toast.error(
        `Failed to install configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error;
    }
  };

  // Fetch tools for a specific MCP server
  const fetchMcpServerTools = async (
    serverId: string,
  ): Promise<ToolDefinition[]> => {
    setLoadingMcpTools((prev) => ({ ...prev, [serverId]: true }));
    try {
      const response = await fetch(
        `http://localhost:38000/api/mcp/servers/${serverId}/tools`,
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Failed to fetch server tools" }));
        throw new Error(errorData.message || "Failed to fetch server tools");
      }

      const data = await response.json();
      if (data.status === "success") {
        const tools = data.tools || [];
        setMcpServerTools((prev) => ({
          ...prev,
          [serverId]: tools,
        }));
        return tools;
      } else {
        throw new Error(data.message || "Failed to fetch server tools");
      }
    } catch (error) {
      console.error(`Error fetching tools for MCP server ${serverId}:`, error);
      // Don't show a toast here as it might be annoying if server is starting up
      return [];
    } finally {
      setLoadingMcpTools((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  // Handle changes in MCP server config fields
  const handleMcpConfigChange = async (
    id: string,
    field: keyof MCPServerConfig,
    value:
      | string
      | number
      | boolean
      | string[]
      | Record<string, string>
      | undefined,
  ) => {
    // Update state with the new value
    setMcpServerConfigs((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));

    // Automatically save when enabling/disabling a server
    if (field === "enabled") {
      try {
        // Get the current config including any env variables
        const currentConfig = {
          ...mcpServerConfigs[id],
          [field]: value,
          env: mcpServerConfigs[id].env || {}, // Ensure env is included
        };

        const response = await fetch(
          `http://localhost:38000/api/mcp/configurations/${id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(currentConfig),
          },
        );

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ message: "Failed to save MCP configuration" }));
          throw new Error(
            errorData.message || "Failed to save MCP configuration",
          );
        }

        // If enabling the server, start it
        if (value === true) {
          toast.info(
            `Starting MCP server ${mcpServerConfigs[id].name || id}...`,
          );

          const startResponse = await fetch(
            `http://localhost:38000/api/mcp/servers/${id}/start`,
            {
              method: "POST",
            },
          );

          if (!startResponse.ok) {
            const errorData = await startResponse
              .json()
              .catch(() => ({ message: "Failed to start MCP server" }));
            throw new Error(errorData.message || "Failed to start MCP server");
          }

          // After starting the server, fetch its tools with increased delay for MCP startup
          toast.success(
            `Server ${mcpServerConfigs[id].name || id} started successfully`,
          );
          toast.info(
            `Fetching tools for ${mcpServerConfigs[id].name || id}...`,
          );

          // Try fetching tools multiple times with increasing delays
          const retryFetchTools = async (retries = 3, delay = 2000) => {
            try {
              const tools = await fetchMcpServerTools(id);
              if (tools && tools.length > 0) {
                toast.success(
                  `Found ${tools.length} tools in ${mcpServerConfigs[id].name || id}`,
                );
                return;
              }

              if (retries > 0) {
                toast.info(
                  `Waiting for tools from ${mcpServerConfigs[id].name || id}...`,
                  {
                    id: `retry-fetch-${id}`,
                  },
                );
                setTimeout(
                  () => retryFetchTools(retries - 1, delay * 1.5),
                  delay,
                );
              } else {
                toast.info(
                  `Server started but no tools found. You may need to refresh.`,
                  {
                    id: `retry-fetch-${id}`,
                    duration: 5000,
                  },
                );
              }
            } catch (err) {
              console.error(`Error in retry fetch for ${id}:`, err);
              if (retries > 0) {
                setTimeout(
                  () => retryFetchTools(retries - 1, delay * 1.5),
                  delay,
                );
              } else {
                toast.error(`Could not fetch tools. Try clicking refresh.`);
              }
            }
          };

          setTimeout(() => retryFetchTools(), 3000);
        } else {
          // If disabling the server, stop it
          toast.info(
            `Stopping MCP server ${mcpServerConfigs[id].name || id}...`,
          );

          try {
            const stopResponse = await fetch(
              `http://localhost:38000/api/mcp/servers/${id}/stop`,
              {
                method: "POST",
              },
            );

            if (!stopResponse.ok) {
              const errorData = await stopResponse
                .json()
                .catch(() => ({ message: "Failed to stop MCP server" }));
              console.warn(
                `Warning when stopping server: ${errorData.message}`,
              );
              // Don't throw, as the config is already updated to disabled
            } else {
              toast.success(
                `Server ${mcpServerConfigs[id].name || id} stopped and disabled`,
              );
            }
          } catch (err) {
            console.error(`Error stopping server ${id}:`, err);
            // Continue anyway as the disabled state is saved
          }

          // Remove tools from the UI display for this server
          setMcpServerTools((prev) => {
            const updated = { ...prev };
            delete updated[id];
            return updated;
          });
        }
      } catch (error) {
        console.error(`Error managing MCP server ${id}:`, error);
        toast.error(
          `Failed to ${value ? "enable" : "disable"} server: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        // Revert the change in UI if save failed
        setMcpServerConfigs((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            [field]: !value,
          },
        }));
      }
    }
  };

  // Save updated MCP configuration
  const handleSaveMcpConfig = async (id: string) => {
    const configToSave = mcpServerConfigs[id];
    if (!configToSave) return;

    try {
      // Explicitly ensure env is included in the payload if it exists
      const payload = {
        ...configToSave,
        env: configToSave.env || {},
      };

      console.log(`Saving config for ${id}:`, payload);

      const response = await fetch(
        `http://localhost:38000/api/mcp/configurations/${id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Failed to save MCP configuration" }));
        throw new Error(
          errorData.message || "Failed to save MCP configuration",
        );
      }

      toast.success(`Configuration for ${configToSave.name || id} saved.`);
    } catch (error) {
      console.error(`Error saving MCP configuration for ${id}:`, error);
      toast.error(
        `Failed to save configuration for ${configToSave.name || id}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  // Handle theme toggle
  const handleToggleTheme = async () => {
    try {
      await toggleTheme();
      const { system } = await getCurrentTheme();
      setCurrentTheme(system);
      toast.success(`Theme switched to ${system} mode`);
    } catch (error) {
      console.error("Error toggling theme:", error);
      toast.error("Failed to toggle theme");
    }
  };

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
    onRefreshServers: fetchAllMcpServers,
  };

  // Navigation items for sidebar
  const navigationItems = [
    { id: "general", label: "General", icon: <SettingsIcon className="h-5 w-5" /> },
    { id: "mcp", label: "MCP Market", icon: <Server className="h-5 w-5" /> },
    { id: "agents", label: "Agents", icon: <LayoutGrid className="h-5 w-5" /> }
  ];

  return (
    <div className="bg-background/20 relative h-full w-full flex overflow-hidden">
      {/* Sidebar */}
      <div className={`bg-card/90 h-full overflow-y-auto border-r border-border/40 flex flex-col transition-all duration-300 ${
        isSidebarCollapsed ? "w-16" : "w-64"
      }`}>
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          {!isSidebarCollapsed && <h1 className="text-foreground text-lg font-bold">Settings</h1>}
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
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
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
                      ? 'bg-primary/10 text-primary font-medium' 
                      : 'hover:bg-foreground/5 text-foreground/80'
                  } ${isSidebarCollapsed ? 'justify-center' : ''}`}
                  title={isSidebarCollapsed ? item.label : undefined}
                >
                  <span className={isSidebarCollapsed ? '' : 'mr-2'}>{item.icon}</span>
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
              isSidebarCollapsed ? 'justify-center' : ''
            }`}
            title={isSidebarCollapsed ? "Close Settings" : undefined}
          >
            <X className={`h-5 w-5 ${isSidebarCollapsed ? '' : 'mr-2'}`} />
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
        {activeTab === "mcp" && (
          <MarketplaceSection {...marketplaceProps} />
        )}

        {/* Agents Tab Content */}
        {activeTab === "agents" && (
          <AgentsTab onNavigateToMcp={() => setActiveTab("mcp")} />
        )}
      </div>
    </div>
  );
}
