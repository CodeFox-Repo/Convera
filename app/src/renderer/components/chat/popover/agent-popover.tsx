import { useThemeSync } from "@/renderer/libs/hooks/use-theme-sync";
import { Agent, useAgentStore } from "@/renderer/libs/stores/agent-store";
import { useMcpStore } from "@/renderer/libs/stores/mcp-store";
import { MCPServerConfig, ToolDefinition } from "@/shared/types/mcp";
import React, { useEffect, useRef, useState } from "react";

interface Tool {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
  serverId?: string;
}

const mockBasicToolsData: Tool[] = [
  {
    id: "websearch",
    name: "Web Search",
    enabled: false,
    description: "Enable web searching capabilities.",
  },
  {
    id: "thinking",
    name: "Thinking Indicator",
    enabled: false,
    description: "Show thinking animations.",
  },
];

/**
 * Modern AgentPopover component with Claude-like interface
 */
export default function AgentPopover() {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [basicTools, setBasicTools] = useState<Tool[]>(mockBasicToolsData);
  const [mcpToolsEnabled, setMcpToolsEnabled] = useState<
    Record<string, Record<string, boolean>>
  >({});

  // Expandable sections state
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    currentAgent: true,
    builtin: true,
    mcp: true,
  });

  // Add state for individual MCP server expansions
  const [expandedMcpServers, setExpandedMcpServers] = useState<
    Record<string, boolean>
  >({});

  const {
    selectedAgent,
    setSelectedAgent,
    availableAgents,
    fetchAgents,
    subscribeToAgentChanges,
    updateAgent: saveAgent,
  } = useAgentStore();

  const {
    mcpServerConfigs,
    loadingMcpConfigs,
    mcpServers,
    fetchMcpConfigurations,
    fetchAllMcpServers,
  } = useMcpStore();
  useThemeSync();

  // Initialize MCP configs and calculate tool states
  const initializeMcpData = async () => {
    await fetchMcpConfigurations();
    // Also fetch server data to get tools
    await fetchAllMcpServers();
    calculateMcpToolsState();
  };

  // Get tools for a specific server - try both ID and name matching
  const getServerTools = (serverId: string) => {
    // First try to find by name, then by ID
    let server = mcpServers.find((s) => s.name === serverId);
    if (!server) {
      // If not found by name, try to find by matching the ID in configs
      const configId = Object.keys(mcpServerConfigs?.mcpServers || {}).find(
        (id) => id === serverId,
      );
      if (configId) {
        // Find server that matches this config
        server = mcpServers.find(
          (s) => s.name === configId || s.displayName === configId,
        );
      }
    }
    const tools = server?.capabilities?.tools || [];
    console.log(
      `getServerTools(${serverId}): found ${tools.length} tools`,
      tools,
    );
    return tools;
  };

  // Calculate MCP tools enabled state based on current agent
  const calculateMcpToolsState = () => {
    if (!selectedAgent || !mcpServerConfigs?.mcpServers) {
      setMcpToolsEnabled({});
      return;
    }

    const newMcpToolsEnabled: Record<string, Record<string, boolean>> = {};

    // Use mcpServerConfigs as the source of truth for server IDs
    Object.entries(mcpServerConfigs.mcpServers).forEach(
      ([serverId, config]) => {
        const serverConfig = config as MCPServerConfig;
        if (!serverConfig.enabled) return;

        const tools = getServerTools(serverId);
        const enabledStatus: Record<string, boolean> = {};

        tools.forEach((tool) => {
          // Tool is enabled if NOT in disableToolReferences
          const isEnabled = !selectedAgent.disableToolReferences?.some(
            (disabled) =>
              disabled.mcpName === serverId && disabled.toolName === tool.name,
          );
          enabledStatus[tool.name] = isEnabled;
        });

        newMcpToolsEnabled[serverId] = enabledStatus;
      },
    );

    console.log("Calculated MCP tools enabled state:", newMcpToolsEnabled);
    setMcpToolsEnabled(newMcpToolsEnabled);
  };

  // Initialize component
  useEffect(() => {
    fetchAgents();
    initializeMcpData();

    // Subscribe to agent changes for auto-sync
    const unsubscribe = subscribeToAgentChanges();

    return () => {
      unsubscribe();
    };
  }, []);

  // Set default agent when agents are loaded and no agent is selected
  useEffect(() => {
    if (availableAgents.length > 0 && !selectedAgent) {
      const defaultAgent = availableAgents.find(
        (agent) => agent.id === "DefaultAssistant",
      );
      if (defaultAgent) {
        setSelectedAgent(defaultAgent);
        console.log("Set default agent: DefaultAssistant");
      }
    }
  }, [availableAgents, selectedAgent]);

  // Recalculate MCP tools enabled state when selected agent changes
  useEffect(() => {
    calculateMcpToolsState();
  }, [selectedAgent, mcpServerConfigs, mcpServers]);

  // Update built-in tools state based on selected agent
  useEffect(() => {
    if (selectedAgent) {
      console.log(
        "Updating built-in tools state for agent:",
        selectedAgent.name,
      );
      // Check if tools are NOT in disableToolReferences
      setBasicTools((prev) =>
        prev.map((tool) => {
          const isEnabled = !selectedAgent.disableToolReferences?.some(
            (disabled) =>
              disabled.toolName === tool.id && disabled.mcpName === "built-in",
          );
          return { ...tool, enabled: isEnabled };
        }),
      );
    } else {
      // Reset to default state if no agent selected
      setBasicTools(mockBasicToolsData);
    }
  }, [selectedAgent]);

  // Handle agent selection
  const handleAgentSelect = (agent: Agent) => {
    console.log(`Agent selected: ${agent.name}`);
    console.log("Agent disable tool references:", agent.disableToolReferences);

    setSelectedAgent(agent);
    localStorage.setItem("selectedAgent", JSON.stringify(agent));

    // Force immediate recalculation of built-in tools state for the new agent
    setBasicTools((prev) =>
      prev.map((tool) => {
        const isEnabled = !agent.disableToolReferences?.some(
          (disabled) =>
            disabled.toolName === tool.id && disabled.mcpName === "built-in",
        );
        return { ...tool, enabled: isEnabled };
      }),
    );

    // Force immediate recalculation of MCP tool states for the new agent
    if (mcpServerConfigs?.mcpServers) {
      console.log(
        "Immediately recalculating MCP tools for new agent:",
        agent.name,
      );
      const newMcpToolsEnabled: Record<string, Record<string, boolean>> = {};

      Object.entries(mcpServerConfigs.mcpServers).forEach(
        ([serverId, config]) => {
          const serverConfig = config as MCPServerConfig;
          if (!serverConfig.enabled) return;

          const tools = getServerTools(serverId);
          const enabledStatus: Record<string, boolean> = {};
          tools.forEach((tool: ToolDefinition) => {
            const isEnabled = !agent.disableToolReferences?.some(
              (disabled) =>
                disabled.mcpName === serverId &&
                disabled.toolName === tool.name,
            );
            enabledStatus[tool.name] = isEnabled;
          });
          newMcpToolsEnabled[serverId] = enabledStatus;
        },
      );

      setMcpToolsEnabled(newMcpToolsEnabled);
      console.log("Immediately updated MCP tools state:", newMcpToolsEnabled);
    }

    window.electronAPI.toggleAgentPopover();
  };

  // Common function to update agent with disabled tool references
  const updateAgentWithDisabledTools = async (
    updatedDisableToolReferences: Array<{
      mcpName: string;
      toolName: string;
      reason?: string;
    }>,
    onSuccess?: () => void,
    successMessage?: string,
  ) => {
    const currentAgent = useAgentStore.getState().selectedAgent;
    if (!currentAgent) {
      console.error("No agent selected for tool update");
      return false;
    }

    const agentData: Agent = {
      ...currentAgent,
      disableToolReferences: updatedDisableToolReferences,
    };

    try {
      await saveAgent(agentData);
      onSuccess?.();
      if (successMessage) {
        console.log(successMessage);
      }
      return true;
    } catch (err) {
      console.error("Failed to update agent:", err);
      return false;
    }
  };

  const handleBasicToolToggle = async (toolId: string) => {
    const currentAgent = useAgentStore.getState().selectedAgent;

    if (!currentAgent) {
      console.error("No agent selected for basic tool toggle");
      return;
    }

    const currentDisabledTools = currentAgent.disableToolReferences || [];
    const isCurrentlyDisabled = currentDisabledTools.some(
      (disabled) =>
        disabled.toolName === toolId && disabled.mcpName === "built-in",
    );
    const newEnabled = isCurrentlyDisabled; // If currently disabled, we want to enable it

    console.log(
      `Toggling basic tool ${toolId} from ${!isCurrentlyDisabled} to ${newEnabled}`,
    );

    let updatedDisabledTools: Array<{
      mcpName: string;
      toolName: string;
      reason?: string;
    }>;
    if (newEnabled) {
      // Remove from disabled list to enable the tool
      updatedDisabledTools = currentDisabledTools.filter(
        (disabled) =>
          !(disabled.toolName === toolId && disabled.mcpName === "built-in"),
      );
    } else {
      // Add to disabled list to disable the tool
      const newDisabledRef = {
        mcpName: "built-in",
        toolName: toolId,
        reason: "Manually disabled",
      };
      updatedDisabledTools = [...currentDisabledTools, newDisabledRef];
    }

    const success = await updateAgentWithDisabledTools(
      updatedDisabledTools,
      () => {
        // Update local state immediately
        setBasicTools((prev) =>
          prev.map((t) =>
            t.id === toolId ? { ...t, enabled: newEnabled } : t,
          ),
        );
      },
      `Successfully toggled basic tool ${toolId} to ${newEnabled ? "enabled" : "disabled"}`,
    );

    return success;
  };

  const handleMcpToolToggle = async (serverId: string, toolName: string) => {
    // Get the latest agent from store
    const currentAgent = useAgentStore.getState().selectedAgent;
    if (!currentAgent) {
      console.error("No agent selected for tool toggle");
      return;
    }

    const currentEnabled = mcpToolsEnabled[serverId]?.[toolName] ?? false;
    const newEnabled = !currentEnabled;

    console.log(
      `Toggling tool ${toolName} for server ${serverId} from ${currentEnabled} to ${newEnabled}`,
    );
    console.log("Current mcpToolsEnabled state:", mcpToolsEnabled);

    const currentDisabledTools = currentAgent.disableToolReferences || [];

    let updatedDisabledTools: Array<{
      mcpName: string;
      toolName: string;
      reason?: string;
    }>;

    if (newEnabled) {
      // Remove from disabled list to enable the tool
      updatedDisabledTools = currentDisabledTools.filter(
        (disabled) =>
          !(disabled.mcpName === serverId && disabled.toolName === toolName),
      );
    } else {
      // Add to disabled list to disable the tool
      const newDisabledRef = {
        mcpName: serverId,
        toolName: toolName,
        reason: "Manually disabled",
      };
      updatedDisabledTools = [...currentDisabledTools, newDisabledRef];
    }

    const success = await updateAgentWithDisabledTools(
      updatedDisabledTools,
      () => {
        setMcpToolsEnabled((prev) => ({
          ...prev,
          [serverId]: {
            ...prev[serverId],
            [toolName]: newEnabled,
          },
        }));
      },
      `Successfully toggled tool ${toolName} to ${newEnabled ? "enabled" : "disabled"}`,
    );

    return success;
  };

  // Handle disable all tools for a server
  const handleDisableAllTools = async (serverId: string) => {
    // Get the latest agent from store
    const currentAgent = useAgentStore.getState().selectedAgent;
    if (!currentAgent) {
      console.error("No agent selected for bulk tool disable");
      return;
    }

    const serverTools = getServerTools(serverId);
    if (serverTools.length === 0) return;

    console.log(`Disabling all tools for server ${serverId}`);

    const currentDisabledTools = currentAgent.disableToolReferences || [];

    // Add all server tools to disabled list
    const newDisabledRefs = serverTools.map((tool: ToolDefinition) => ({
      mcpName: serverId,
      toolName: tool.name,
      reason: "Bulk disabled",
    }));

    // Filter out existing disabled tools for this server and add new ones
    const otherDisabledTools = currentDisabledTools.filter(
      (disabled) => disabled.mcpName !== serverId,
    );
    const updatedDisabledTools = [...otherDisabledTools, ...newDisabledRefs];

    const success = await updateAgentWithDisabledTools(
      updatedDisabledTools,
      () => {
        const newEnabledState: Record<string, boolean> = {};
        serverTools.forEach((tool: ToolDefinition) => {
          newEnabledState[tool.name] = false;
        });
        setMcpToolsEnabled((prev) => ({
          ...prev,
          [serverId]: newEnabledState,
        }));
      },
      `Successfully disabled all tools for server ${serverId}`,
    );

    return success;
  };

  // Handle enable all tools for a server
  const handleEnableAllTools = async (serverId: string) => {
    // Get the latest agent from store
    const currentAgent = useAgentStore.getState().selectedAgent;
    if (!currentAgent) {
      console.error("No agent selected for bulk tool enable");
      return;
    }

    const serverTools = getServerTools(serverId);
    if (serverTools.length === 0) return;

    console.log(`Enabling all tools for server ${serverId}`);

    const currentDisabledTools = currentAgent.disableToolReferences || [];

    // Remove all tools from this server from the disabled list
    const updatedDisabledTools = currentDisabledTools.filter(
      (disabled) => disabled.mcpName !== serverId,
    );

    const success = await updateAgentWithDisabledTools(
      updatedDisabledTools,
      () => {
        const newEnabledState: Record<string, boolean> = {};
        serverTools.forEach((tool: ToolDefinition) => {
          newEnabledState[tool.name] = true;
        });
        setMcpToolsEnabled((prev) => ({
          ...prev,
          [serverId]: newEnabledState,
        }));
      },
      `Successfully enabled all tools for server ${serverId}`,
    );

    return success;
  };

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Toggle individual MCP server expansion
  const toggleMcpServer = (serverId: string) => {
    setExpandedMcpServers((prev) => ({ ...prev, [serverId]: !prev[serverId] }));
  };

  // Handle click outside to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        window.electronAPI.toggleAgentPopover();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.electronAPI.toggleAgentPopover();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Count enabled tools for MCP server
  const getEnabledToolsCount = (serverId: string) => {
    const tools = getServerTools(serverId);
    const enabledCount = Object.values(mcpToolsEnabled[serverId] || {}).filter(
      Boolean,
    ).length;
    return { enabled: enabledCount, total: tools.length };
  };

  return (
    <div className="relative" ref={popoverRef}>
      <div
        className="bg-background border-border w-80 h-[350px] rounded-xl border shadow-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <h3 className="font-medium text-sm text-foreground">
              Agent Configuration
            </h3>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Current Agent Section */}
          <div className="p-4 border-b border-border/30">
            <div
              className="flex items-center justify-between cursor-pointer group hover:bg-muted/30 rounded-lg p-2 -m-2 transition-all duration-200"
              onClick={() => toggleSection("currentAgent")}
            >
              <div className="flex items-center gap-3">
                <svg
                  className="w-4 h-4 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <div>
                  <div className="text-sm font-medium text-foreground">
                    Current Agent
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedAgent ? selectedAgent.name : "No Agent Selected"}
                  </div>
                </div>
              </div>
              <svg
                className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ease-in-out ${
                  expandedSections.currentAgent ? "rotate-90" : "rotate-0"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>

            {/* Agent List */}
            <div
              className={`transition-all duration-250 ease-in-out overflow-hidden ${
                expandedSections.currentAgent
                  ? "max-h-96 opacity-100 transform scale-y-100"
                  : "max-h-0 opacity-0 transform scale-y-95"
              }`}
            >
              <div className="mt-3 space-y-1">
                {availableAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`p-3 cursor-pointer transition-all duration-200 rounded-lg ${
                      selectedAgent?.id === agent.id
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted/30"
                    }`}
                    onClick={() => handleAgentSelect(agent)}
                  >
                    <div className="flex justify-between items-center">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-foreground truncate">
                          {agent.name}
                        </div>
                        {agent.description && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {agent.description}
                          </div>
                        )}
                      </div>
                      {selectedAgent?.id === agent.id && (
                        <svg
                          className="w-4 h-4 text-primary flex-shrink-0 ml-2"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Built-in Tools Section */}
          <div className="px-4 py-3 border-b border-border/30">
            <div
              className="flex items-center justify-between cursor-pointer group hover:bg-muted/30 rounded-lg p-2 -m-2 transition-all duration-200"
              onClick={() => toggleSection("builtin")}
            >
              <div className="flex items-center gap-3">
                <svg
                  className="w-4 h-4 text-blue-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span className="text-sm font-medium text-foreground">
                  Built-in Tools
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ease-in-out ${
                  expandedSections.builtin ? "rotate-90" : "rotate-0"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>

            <div
              className={`transition-all duration-250 ease-in-out overflow-hidden ${
                expandedSections.builtin
                  ? "max-h-96 opacity-100 transform scale-y-100"
                  : "max-h-0 opacity-0 transform scale-y-95"
              }`}
            >
              <div className="mt-3 space-y-2">
                {basicTools.map((tool) => (
                  <div
                    key={tool.id}
                    className="flex items-center justify-between p-2 hover:bg-muted/20 rounded-lg transition-all duration-150"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        {tool.id === "websearch" ? (
                          <svg
                            className="w-3.5 h-3.5 text-blue-700 dark:text-blue-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                            />
                          </svg>
                        ) : tool.id === "thinking" ? (
                          <svg
                            className="w-3.5 h-3.5 text-blue-700 dark:text-blue-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                            />
                          </svg>
                        ) : (
                          <span className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase">
                            {tool.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-sm text-foreground">
                          {tool.name}
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-3">
                      <button
                        onClick={() => handleBasicToolToggle(tool.id)}
                        className={`relative w-11 h-6 rounded-full transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                          tool.enabled
                            ? "bg-blue-500 dark:bg-blue-600"
                            : "bg-gray-300 dark:bg-gray-600"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-150 ${
                            tool.enabled ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* MCP Servers Section */}
          <div className="px-4 py-3">
            <div
              className="flex items-center justify-between cursor-pointer group hover:bg-muted/30 rounded-lg p-2 -m-2 transition-all duration-200"
              onClick={() => toggleSection("mcp")}
            >
              <div className="flex items-center gap-3">
                <svg
                  className="w-4 h-4 text-emerald-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-sm font-medium text-foreground">
                  MCP Servers
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ease-in-out ${
                  expandedSections.mcp ? "rotate-90" : "rotate-0"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>

            <div
              className={`transition-all duration-250 ease-in-out overflow-hidden ${
                expandedSections.mcp
                  ? "max-h-none opacity-100 transform scale-y-100"
                  : "max-h-0 opacity-0 transform scale-y-95"
              }`}
            >
              {loadingMcpConfigs ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
                </div>
              ) : !mcpServerConfigs?.mcpServers ||
                Object.keys(mcpServerConfigs.mcpServers).length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No MCP servers configured
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {Object.entries(mcpServerConfigs.mcpServers)
                    .sort(([, a], [, b]) => {
                      const configA = a as MCPServerConfig;
                      const configB = b as MCPServerConfig;
                      if (configA.enabled && !configB.enabled) return -1;
                      if (!configA.enabled && configB.enabled) return 1;
                      return (configA.name || "").localeCompare(
                        configB.name || "",
                      );
                    })
                    .map(([id, config]) => {
                      const serverConfig = config as MCPServerConfig;
                      const { enabled, total } = getEnabledToolsCount(id);
                      const serverTools = getServerTools(id);
                      const isServerExpanded =
                        expandedMcpServers[id] ??
                        (serverConfig.enabled && serverTools.length > 0);

                      return (
                        <div
                          key={id}
                          className="border border-border/50 rounded-lg overflow-hidden transition-all duration-150"
                        >
                          {/* Server Header */}
                          <div
                            className="flex items-center justify-between p-3 bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors duration-150"
                            onClick={() =>
                              config.enabled &&
                              serverTools.length > 0 &&
                              toggleMcpServer(id)
                            }
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-2 h-2 rounded-full ${config.enabled ? "bg-emerald-500 dark:bg-emerald-400" : "bg-gray-400 dark:bg-gray-500"}`}
                              ></div>
                              <div>
                                <div className="font-medium text-sm text-foreground">
                                  {config.name || id}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {config.enabled
                                    ? `${enabled}/${total} tools enabled`
                                    : "Disabled"}
                                </div>
                              </div>
                            </div>
                            {config.enabled && serverTools.length > 0 && (
                              <svg
                                className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ease-in-out ${
                                  isServerExpanded ? "rotate-90" : "rotate-0"
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            )}
                          </div>

                          {/* Server Tools */}
                          {config.enabled && serverTools.length > 0 && (
                            <div
                              className={`transition-all duration-250 ease-in-out overflow-hidden ${
                                isServerExpanded
                                  ? "max-h-none opacity-100 transform scale-y-100"
                                  : "max-h-0 opacity-0 transform scale-y-95"
                              }`}
                            >
                              <div className="p-2 space-y-1">
                                {serverTools.length === 0 ? (
                                  <div className="flex justify-center py-2">
                                    <div className="text-sm text-muted-foreground">
                                      No tools available
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {/* Enable/Disable All Tools Option */}
                                    <div className="flex items-center justify-between p-2 hover:bg-muted/20 rounded-md transition-all duration-150">
                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                                          <span className="text-xs font-medium rounded-2xl text-gray-600 dark:text-gray-300 uppercase">
                                            {enabled > 0 ? "D" : "E"}
                                          </span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="font-medium text-sm text-foreground truncate">
                                            {enabled > 0
                                              ? "Disable all tools"
                                              : "Enable all tools"}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex-shrink-0 ml-3">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (enabled > 0) {
                                              handleDisableAllTools(id);
                                            } else {
                                              handleEnableAllTools(id);
                                            }
                                          }}
                                          className={`relative w-11 h-6 rounded-full transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                                            enabled > 0
                                              ? "bg-blue-500 dark:bg-blue-600"
                                              : "bg-gray-300 dark:bg-gray-600"
                                          }`}
                                        >
                                          <span
                                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-150 ${
                                              enabled > 0
                                                ? "translate-x-5"
                                                : "translate-x-0"
                                            }`}
                                          />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="border-t border-border/30 my-2"></div>

                                    {/* Individual Tools */}
                                    {serverTools.map((tool, toolIndex) => (
                                      <div
                                        key={tool.name || toolIndex}
                                        className="flex items-center justify-between p-2 hover:bg-muted/20 rounded-md transition-all duration-150"
                                      >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                          <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 uppercase">
                                              {tool.name.charAt(0)}
                                            </span>
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="font-medium text-sm text-foreground truncate">
                                              {tool.name}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex-shrink-0 ml-3">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleMcpToolToggle(
                                                id,
                                                tool.name,
                                              );
                                            }}
                                            className={`relative w-11 h-6 rounded-full transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                                              (mcpToolsEnabled[id]?.[
                                                tool.name
                                              ] ?? false)
                                                ? "bg-blue-500 dark:bg-blue-600"
                                                : "bg-gray-300 dark:bg-gray-600"
                                            }`}
                                          >
                                            <span
                                              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-150 ${
                                                (mcpToolsEnabled[id]?.[
                                                  tool.name
                                                ] ?? false)
                                                  ? "translate-x-5"
                                                  : "translate-x-0"
                                              }`}
                                            />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
