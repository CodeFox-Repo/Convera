import { useThemeSync } from "@/renderer/libs/hooks/use-theme-sync";
import { Agent, useAgentStore } from "@/renderer/libs/stores/agent-store";
import { ToolReference } from "@/server/agents/types";
import { MCPServerConfig, ToolDefinition } from "@/server/mcp/types";
import React, { useEffect, useRef, useState } from "react";

interface Tool {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
  serverId?: string;
}

const mockBasicToolsData: Tool[] = [
  { id: "websearch", name: "Web Search", enabled: false, description: "Enable web searching capabilities." },
  { id: "thinking", name: "Thinking Indicator", enabled: false, description: "Show thinking animations." },
];

/**
 * Modern AgentPopover component with Claude-like interface
 */
export default function AgentPopover() {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [basicTools, setBasicTools] = useState<Tool[]>(mockBasicToolsData);
  const [mcpServerConfigs, setMcpServerConfigs] = useState<Record<string, MCPServerConfig>>({});
  const [mcpServerTools, setMcpServerTools] = useState<Record<string, ToolDefinition[]>>({});
  const [mcpToolsEnabled, setMcpToolsEnabled] = useState<Record<string, Record<string, boolean>>>({});
  const [loadingMcpConfigs, setLoadingMcpConfigs] = useState(true);
  const [loadingMcpTools, setLoadingMcpTools] = useState<Record<string, boolean>>({});
  
  // Expandable sections state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    currentAgent: true,
    builtin: true,
    mcp: true,
  });
  
  // Add state for individual MCP server expansions
  const [expandedMcpServers, setExpandedMcpServers] = useState<Record<string, boolean>>({});

  const { 
    selectedAgent, 
    setSelectedAgent, 
    availableAgents,
    fetchAgents,
    subscribeToAgentChanges
  } = useAgentStore();
useThemeSync();
  // Fetch agents from server
  const fetchMcpConfigs = async () => {
    setLoadingMcpConfigs(true);
    console.log("Fetching MCP configurations...");
    const response = await fetch("http://localhost:38000/api/mcp/configurations");
    if (response.ok) {
      const data = await response.json();
      const configs = (data.configurations || {}) as Record<string, MCPServerConfig>;
      console.log("Loaded MCP configurations:", configs);
      setMcpServerConfigs(configs);

      Object.entries(configs)
        .filter(([, config]) => config.enabled)
        .forEach(([id]) => {
          fetchMcpServerTools(id);
        });
    } else {
      console.error("Failed to fetch MCP configurations:", response.status);
    }
    setLoadingMcpConfigs(false);
  };

  // Fetch tools for specific MCP server
  const fetchMcpServerTools = async (id: string) => {
    setLoadingMcpTools(prev => ({ ...prev, [id]: true }));
    console.log(`Fetching tools for MCP server: ${id}`);
    const response = await fetch(`http://localhost:38000/api/mcp/servers/${id}/tools`);
    if (response.ok) {
      const data = await response.json();
      if (data.status === "success" && Array.isArray(data.tools)) {
        console.log(`Loaded ${data.tools.length} tools for server ${id}:`, data.tools);
        setMcpServerTools(prev => {
          const newServerTools = { ...prev, [id]: data.tools };
          
          // Immediately recalculate enabled state for current agent when tools are loaded
          if (selectedAgent) {
            const enabledStatus: Record<string, boolean> = {};
            data.tools.forEach((tool: ToolDefinition) => {
              const isEnabled = selectedAgent.toolReferences?.some(ref => 
                ref.mcpName === id && ref.toolName === tool.name
              ) ?? false;
              enabledStatus[tool.name] = isEnabled;
            });
            setMcpToolsEnabled(prevEnabled => ({ 
              ...prevEnabled, 
              [id]: enabledStatus 
            }));
          }
          
          return newServerTools;
        });
      } else {
        console.warn(`Invalid tools response format for server ${id}:`, data);
      }
    } else {
      console.error(`Failed to fetch tools for server ${id}: ${response.status}`);
    }
    setLoadingMcpTools(prev => ({ ...prev, [id]: false }));
  };

  // Initialize component
  useEffect(() => {
    fetchAgents();
    fetchMcpConfigs();

    // Subscribe to agent changes for auto-sync
    const unsubscribe = subscribeToAgentChanges();
    
    return () => {
      unsubscribe();
    };
  }, []);

  // Set default agent when agents are loaded and no agent is selected
  useEffect(() => {
    if (availableAgents.length > 0 && !selectedAgent) {
      const defaultAgent = availableAgents.find(agent => agent.id === "DefaultAssistant");
      if (defaultAgent) {
        setSelectedAgent(defaultAgent);
        console.log("Set default agent: DefaultAssistant");
      }
    }
  }, [availableAgents, selectedAgent]);

  // Recalculate MCP tools enabled state when selected agent changes
  useEffect(() => {
    if (selectedAgent && Object.keys(mcpServerTools).length > 0) {
      console.log("Recalculating MCP tools enabled state for agent:", selectedAgent.name);
      console.log("Agent tool references:", selectedAgent.toolReferences);
      
      const newMcpToolsEnabled: Record<string, Record<string, boolean>> = {};
      
      Object.entries(mcpServerTools).forEach(([serverId, tools]) => {
        const enabledStatus: Record<string, boolean> = {};
        tools.forEach((tool: ToolDefinition) => {
          const isEnabled = selectedAgent.toolReferences?.some(ref => 
            ref.mcpName === serverId && ref.toolName === tool.name
          ) ?? false;
          enabledStatus[tool.name] = isEnabled;
          console.log(`Tool ${serverId}:${tool.name} enabled: ${isEnabled}`);
        });
        newMcpToolsEnabled[serverId] = enabledStatus;
      });
      
      setMcpToolsEnabled(newMcpToolsEnabled);
      console.log("Updated MCP tools enabled state:", newMcpToolsEnabled);
    } else if (!selectedAgent) {
      // Clear all tool states if no agent is selected
      setMcpToolsEnabled({});
      console.log("Cleared MCP tools state - no agent selected");
    }
  }, [selectedAgent, mcpServerTools]);

  // Update built-in tools state based on selected agent
  useEffect(() => {
    if (selectedAgent) {
      console.log("Updating built-in tools state for agent:", selectedAgent.name);
      // Use toolReferences instead of toolNames
      setBasicTools(prev => prev.map(tool => {
        const isEnabled = selectedAgent.toolReferences?.some(ref => 
          ref.toolName === tool.id && ref.mcpName === "built-in"
        ) ?? false;
        return { ...tool, enabled: isEnabled };
      }));
    } else {
      // Reset to default state if no agent selected
      setBasicTools(mockBasicToolsData);
    }
  }, [selectedAgent]);

  // Handle agent selection
  const handleAgentSelect = (agent: Agent) => {
    console.log(`Agent selected: ${agent.name}`);
    console.log("Agent tool references:", agent.toolReferences);
    
    setSelectedAgent(agent);
    localStorage.setItem("selectedAgent", JSON.stringify(agent));
    
    // Force immediate recalculation of built-in tools state for the new agent
    setBasicTools(prev => prev.map(tool => {
      const isEnabled = agent.toolReferences?.some(ref => 
        ref.toolName === tool.id && ref.mcpName === "built-in"
      ) ?? false;
      return { ...tool, enabled: isEnabled };
    }));
    
    // Force immediate recalculation of MCP tool states for the new agent
    if (Object.keys(mcpServerTools).length > 0) {
      console.log("Immediately recalculating MCP tools for new agent:", agent.name);
      const newMcpToolsEnabled: Record<string, Record<string, boolean>> = {};
      
      Object.entries(mcpServerTools).forEach(([serverId, tools]) => {
        const enabledStatus: Record<string, boolean> = {};
        tools.forEach((tool: ToolDefinition) => {
          const isEnabled = agent.toolReferences?.some(ref => 
            ref.mcpName === serverId && ref.toolName === tool.name
          ) ?? false;
          enabledStatus[tool.name] = isEnabled;
        });
        newMcpToolsEnabled[serverId] = enabledStatus;
      });
      
      setMcpToolsEnabled(newMcpToolsEnabled);
      console.log("Immediately updated MCP tools state:", newMcpToolsEnabled);
    }
    
    window.electronAPI.toggleAgentPopover();
  };

  const handleBasicToolToggle = async (toolId: string) => {
    const currentAgent = useAgentStore.getState().selectedAgent;
    
    if (!currentAgent) {
      console.error("No agent selected for basic tool toggle");
      return;
    }

    const currentToolReferences = currentAgent.toolReferences || [];
    const isCurrentlyEnabled = currentToolReferences.some(ref => 
      ref.toolName === toolId && ref.mcpName === "built-in"
    );
    const newEnabled = !isCurrentlyEnabled;
    
    console.log(`Toggling basic tool ${toolId} from ${isCurrentlyEnabled} to ${newEnabled}`);
    
    let updatedToolReferences: ToolReference[];
    if (newEnabled) {
      // Add the basic tool reference with special built-in identifier
      const newToolRef: ToolReference = {
        mcpName: "built-in",
        toolName: toolId,
        isBuiltIn: true,
      };
      updatedToolReferences = [...currentToolReferences, newToolRef];
    } else {
      // Remove the basic tool reference
      updatedToolReferences = currentToolReferences.filter(ref => 
        !(ref.toolName === toolId && ref.mcpName === "built-in")
      );
    }

    const agentData = {
      id: currentAgent.id,
      name: currentAgent.name,
      description: currentAgent.description,
      toolReferences: updatedToolReferences,
    };

    const response = await fetch(`http://localhost:38000/api/agents/${currentAgent.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentData),
    });
    
    if (response.ok) {
      const updatedAgent = { ...currentAgent, toolReferences: updatedToolReferences };
      
      // Use store methods to update agent
      useAgentStore.getState().updateSelectedAgent(updatedAgent);
      useAgentStore.getState().updateAvailableAgent(updatedAgent);
      
      // Update local state immediately
      setBasicTools(prev => prev.map(t => 
        t.id === toolId ? { ...t, enabled: newEnabled } : t
      ));
      
      console.log(`Successfully toggled basic tool ${toolId} to ${newEnabled ? 'enabled' : 'disabled'}`);
    } else {
      console.error(`Failed to update agent: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error("Error response:", errorText);
    }
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
    
    console.log(`Toggling tool ${toolName} for server ${serverId} to ${newEnabled ? 'enabled' : 'disabled'}`);
    
    const currentToolReferences = currentAgent.toolReferences || [];
    
    let updatedToolReferences: ToolReference[];
    
    if (newEnabled) {
      const newToolRef: ToolReference = {
        mcpName: serverId,
        toolName: toolName,
        isBuiltIn: serverId === "Dev-MCP" || serverId === "codefox-mcp",
      };
      updatedToolReferences = [...currentToolReferences, newToolRef];
    } else {
      updatedToolReferences = currentToolReferences.filter(ref => 
        !(ref.mcpName === serverId && ref.toolName === toolName)
      );
    }

    const agentData = {
      id: currentAgent.id,
      name: currentAgent.name,
      description: currentAgent.description,
      toolReferences: updatedToolReferences,
    };

    const response = await fetch(`http://localhost:38000/api/agents/${currentAgent.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentData),
    });
    
    if (response.ok) {
      const updatedAgent = { ...currentAgent, toolReferences: updatedToolReferences };
      
      // Use store methods instead of manual updates
      useAgentStore.getState().updateSelectedAgent(updatedAgent);
      useAgentStore.getState().updateAvailableAgent(updatedAgent);
      
      setMcpToolsEnabled(prev => ({
        ...prev,
        [serverId]: {
          ...prev[serverId],
          [toolName]: newEnabled
        }
      }));
      
      console.log(`Successfully toggled tool ${toolName} to ${newEnabled ? 'enabled' : 'disabled'}`);
    } else {
      console.error(`Failed to update agent: ${response.status} ${response.statusText}`);
    }
  };

  // Handle disable all tools for a server
  const handleDisableAllTools = async (serverId: string) => {
    // Get the latest agent from store
    const currentAgent = useAgentStore.getState().selectedAgent;
    if (!currentAgent) {
      console.error("No agent selected for bulk tool disable");
      return;
    }

    const serverTools = mcpServerTools[serverId] || [];
    if (serverTools.length === 0) return;

    console.log(`Disabling all tools for server ${serverId}`);
    
    const currentToolReferences = currentAgent.toolReferences || [];
    
    // Remove all tools from this server
    const updatedToolReferences = currentToolReferences.filter(ref => ref.mcpName !== serverId);

    const agentData = {
      id: currentAgent.id,
      name: currentAgent.name,
      description: currentAgent.description,
      toolReferences: updatedToolReferences,
    };

    const response = await fetch(`http://localhost:38000/api/agents/${currentAgent.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentData),
    });
    
    if (response.ok) {
      const updatedAgent = { ...currentAgent, toolReferences: updatedToolReferences };
      
      // Use store methods instead of manual updates
      useAgentStore.getState().updateSelectedAgent(updatedAgent);
      useAgentStore.getState().updateAvailableAgent(updatedAgent);
      
      // Update all tools for this server to disabled
      const newEnabledState: Record<string, boolean> = {};
      serverTools.forEach(tool => {
        newEnabledState[tool.name] = false;
      });
      
      setMcpToolsEnabled(prev => ({
        ...prev,
        [serverId]: newEnabledState
      }));
      
      console.log(`Successfully disabled all tools for server ${serverId}`);
    } else {
      console.error(`Failed to update agent: ${response.status} ${response.statusText}`);
    }
  };

  // Handle enable all tools for a server
  const handleEnableAllTools = async (serverId: string) => {
    // Get the latest agent from store
    const currentAgent = useAgentStore.getState().selectedAgent;
    if (!currentAgent) {
      console.error("No agent selected for bulk tool enable");
      return;
    }

    const serverTools = mcpServerTools[serverId] || [];
    if (serverTools.length === 0) return;

    console.log(`Enabling all tools for server ${serverId}`);
    
    const currentToolReferences = currentAgent.toolReferences || [];
    
    // Add all tools from this server that aren't already added
    const existingServerTools = currentToolReferences
      .filter(ref => ref.mcpName === serverId)
      .map(ref => ref.toolName);
    
    const newToolRefs = serverTools
      .filter(tool => !existingServerTools.includes(tool.name))
      .map(tool => ({
        mcpName: serverId,
        toolName: tool.name,
        isBuiltIn: serverId === "Dev-MCP" || serverId === "codefox-mcp",
      }));
    
    const updatedToolReferences = [...currentToolReferences, ...newToolRefs];

    const agentData = {
      id: currentAgent.id,
      name: currentAgent.name,
      description: currentAgent.description,
      toolReferences: updatedToolReferences,
    };

    const response = await fetch(`http://localhost:38000/api/agents/${currentAgent.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentData),
    });
    
    if (response.ok) {
      const updatedAgent = { ...currentAgent, toolReferences: updatedToolReferences };
      
      // Use store methods instead of manual updates
      useAgentStore.getState().updateSelectedAgent(updatedAgent);
      useAgentStore.getState().updateAvailableAgent(updatedAgent);
      
      // Update all tools for this server to enabled
      const newEnabledState: Record<string, boolean> = {};
      serverTools.forEach(tool => {
        newEnabledState[tool.name] = true;
      });
      
      setMcpToolsEnabled(prev => ({
        ...prev,
        [serverId]: newEnabledState
      }));
      
      console.log(`Successfully enabled all tools for server ${serverId}`);
    } else {
      console.error(`Failed to update agent: ${response.status} ${response.statusText}`);
    }
  };

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Toggle individual MCP server expansion
  const toggleMcpServer = (serverId: string) => {
    setExpandedMcpServers(prev => ({ ...prev, [serverId]: !prev[serverId] }));
  };

  // Handle click outside to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        window.electronAPI.toggleAgentPopover();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        window.electronAPI.toggleAgentPopover();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Count enabled tools for MCP server
  const getEnabledToolsCount = (serverId: string) => {
    const tools = mcpServerTools[serverId] || [];
    const enabledCount = Object.values(mcpToolsEnabled[serverId] || {}).filter(Boolean).length;
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
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <h3 className="font-medium text-sm text-foreground">Agent Configuration</h3>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Current Agent Section */}
          <div className="p-4 border-b border-border/30">
            <div 
              className="flex items-center justify-between cursor-pointer group hover:bg-muted/30 rounded-lg p-2 -m-2 transition-all duration-200"
              onClick={() => toggleSection('currentAgent')}
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <div>
                  <div className="text-sm font-medium text-foreground">Current Agent</div>
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
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
                        <div className="font-medium text-sm text-foreground truncate">{agent.name}</div>
                        {agent.description && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {agent.description}
                          </div>
                        )}
                      </div>
                      {selectedAgent?.id === agent.id && (
                        <svg className="w-4 h-4 text-primary flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
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
              onClick={() => toggleSection('builtin')}
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm font-medium text-foreground">Built-in Tools</span>
              </div>
              <svg
                className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ease-in-out ${
                  expandedSections.builtin ? "rotate-90" : "rotate-0"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
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
                          <svg className="w-3.5 h-3.5 text-blue-700 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                          </svg>
                        ) : tool.id === "thinking" ? (
                          <svg className="w-3.5 h-3.5 text-blue-700 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        ) : (
                          <span className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase">
                            {tool.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-sm text-foreground">{tool.name}</div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-3">
                      <button
                        onClick={() => handleBasicToolToggle(tool.id)}
                        className={`relative w-11 h-6 rounded-full transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                          tool.enabled ? "bg-blue-500 dark:bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
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
              onClick={() => toggleSection('mcp')}
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium text-foreground">MCP Servers</span>
              </div>
              <svg
                className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ease-in-out ${
                  expandedSections.mcp ? "rotate-90" : "rotate-0"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
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
              ) : Object.keys(mcpServerConfigs).length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No MCP servers configured
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {Object.entries(mcpServerConfigs)
                    .sort(([, a], [, b]) => {
                      if (a.enabled && !b.enabled) return -1;
                      if (!a.enabled && b.enabled) return 1;
                      return (a.name || "").localeCompare(b.name || "");
                    })
                    .map(([id, config]) => {
                      const { enabled, total } = getEnabledToolsCount(id);
                      const serverTools = mcpServerTools[id] || [];
                      const isServerExpanded = expandedMcpServers[id] ?? (config.enabled && serverTools.length > 0);
                      
                      return (
                        <div 
                          key={id} 
                          className="border border-border/50 rounded-lg overflow-hidden transition-all duration-150"
                        >
                          {/* Server Header */}
                          <div 
                            className="flex items-center justify-between p-3 bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors duration-150"
                            onClick={() => config.enabled && serverTools.length > 0 && toggleMcpServer(id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${config.enabled ? "bg-emerald-500 dark:bg-emerald-400" : "bg-gray-400 dark:bg-gray-500"}`}></div>
                              <div>
                                <div className="font-medium text-sm text-foreground">{config.name || id}</div>
                                <div className="text-xs text-muted-foreground">
                                  {config.enabled ? `${enabled}/${total} tools enabled` : 'Disabled'}
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
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
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
                                {loadingMcpTools[id] ? (
                                  <div className="flex justify-center py-2">
                                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
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
                                            {enabled > 0 ? "Disable all tools" : "Enable all tools"}
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
                                            enabled > 0 ? "bg-blue-500 dark:bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
                                          }`}
                                        >
                                          <span 
                                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-150 ${
                                              enabled > 0 ? "translate-x-5" : "translate-x-0"
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
                                            <div className="font-medium text-sm text-foreground truncate">{tool.name}</div>
                                          </div>
                                        </div>
                                        <div className="flex-shrink-0 ml-3">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleMcpToolToggle(id, tool.name);
                                            }}
                                            className={`relative w-11 h-6 rounded-full transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                                              mcpToolsEnabled[id]?.[tool.name] ?? false ? "bg-blue-500 dark:bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
                                            }`}
                                          >
                                            <span 
                                              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-150 ${
                                                mcpToolsEnabled[id]?.[tool.name] ?? false ? "translate-x-5" : "translate-x-0"
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