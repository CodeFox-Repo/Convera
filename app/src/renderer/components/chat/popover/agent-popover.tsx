import { Agent, useAgentStore } from "@/renderer/libs/stores/agent-store";

import { ToolReference } from "@/server/agents/types";
import { MCPServerConfig, ToolDefinition } from "@/server/mcp/types";
import React, { useEffect, useRef, useState } from "react";

interface Tool {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
  serverId?: string; // To associate tools with specific MCP servers
}

interface MCPServer {
  id: string;
  name: string;
  description?: string;
  status: "online" | "offline" | "connecting";
  running?: boolean;
  enabled?: boolean;
  toolCount?: number;
  serverUrl?: string | null;
  // Fields from the API response
  kind?: string;
  url?: string;
  command?: string;
}

// Keep mockBasicToolsData as mentioned by the user
const mockBasicToolsData: Tool[] = [
  { id: "websearch", name: "Web Search", enabled: true, description: "Enable web searching capabilities." },
  { id: "thinking", name: "Thinking Indicator", enabled: false, description: "Show thinking animations." },
];

/**
 * AgentPopover component to be displayed in a dedicated BrowserWindow
 */
// TODO: this component need to refactor
export default function AgentPopover() {
  const popoverRef = useRef<HTMLDivElement>(null);
  // const [agents] = useState<Agent[]>([]); 
  const [basicTools, setBasicTools] = useState<Tool[]>(mockBasicToolsData);
  const [agentTools, setAgentTools] = useState<Tool[]>([]);
  const [mcpServerConfigs, setMcpServerConfigs] = useState<Record<string, MCPServerConfig>>({});
  const [mcpServerTools, setMcpServerTools] = useState<Record<string, ToolDefinition[]>>({});
  const [mcpToolsEnabled, setMcpToolsEnabled] = useState<Record<string, Record<string, boolean>>>({});
  const [selectedMcpServer, setSelectedMcpServer] = useState<MCPServer | null>(null);
  const [showMcpServerTools, setShowMcpServerTools] = useState(false);
  const [showAgentList, setShowAgentList] = useState(true);
  const [loadingMcpConfigs, setLoadingMcpConfigs] = useState(true);
  const [loadingMcpTools, setLoadingMcpTools] = useState<Record<string, boolean>>({});
  
  // Dropdown state variables
  const [showBuiltInTools, setShowBuiltInTools] = useState(true);
  const [showAgentTools, setShowAgentTools] = useState(true);
  const [showMcpServersSection, setShowMcpServersSection] = useState(true);


  const { 
    selectedAgent, 
    setSelectedAgent, 
    availableAgents, 
    setAvailableAgents 
  } = useAgentStore();
  

  // Function to fetch agents from the server
  const fetchAgents = async () => {
    try {
      console.log("Fetching available agents...");
      const response = await fetch("http://localhost:38000/api/agents");
      if (response.ok) {
        const data = await response.json();
        if (data.status === "success" && Array.isArray(data.agents)) {
          console.log(`Loaded ${data.agents.length} agents`);
          setAvailableAgents(data.agents);
        }
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
    }
  };

  // Function to fetch MCP configurations
  const fetchMcpConfigs = async () => {
    try {
      setLoadingMcpConfigs(true);
      console.log("Fetching MCP configurations...");
      const response = await fetch("http://localhost:38000/api/mcp/configurations");
      if (response.ok) {
        const data = await response.json();
        const configs = (data.configurations || {}) as Record<string, MCPServerConfig>;
        console.log("Loaded MCP configurations:", configs);
        setMcpServerConfigs(configs);

        // Fetch tools for enabled MCP servers
        Object.entries(configs)
          .filter(([, config]) => config.enabled)
          .forEach(([id]) => {
            fetchMcpServerTools(id);
          });
      } else {
        console.error("Failed to fetch MCP configurations:", response.status);
      }
    } catch (error) {
      console.error("Error fetching MCP configurations:", error);
    } finally {
      setLoadingMcpConfigs(false);
    }
  };

  // Function to fetch tools for a specific MCP server
  const fetchMcpServerTools = async (id: string) => {
    setLoadingMcpTools(prev => ({ ...prev, [id]: true }));
    try {
      console.log(`Fetching tools for MCP server: ${id}`);
      const response = await fetch(`http://localhost:38000/api/mcp/servers/${id}/tools`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === "success" && Array.isArray(data.tools)) {
          console.log(`Loaded ${data.tools.length} tools for server ${id}:`, data.tools);
          setMcpServerTools(prev => ({ ...prev, [id]: data.tools }));
          
          // Initialize enabled status based on selected agent's tool references
          const enabledStatus: Record<string, boolean> = {};
          data.tools.forEach((tool: ToolDefinition) => {
            // Check if this tool is in the selected agent's tool references
            const isEnabled = selectedAgent?.toolReferences?.some(ref => 
              ref.mcpName === id && ref.toolName === tool.name
            ) ?? false;
            enabledStatus[tool.name] = isEnabled;
          });
          setMcpToolsEnabled(prev => ({ ...prev, [id]: enabledStatus }));
        } else {
          console.warn(`Invalid tools response format for server ${id}:`, data);
        }
      } else {
        console.error(`Failed to fetch tools for server ${id}: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error fetching tools for server ${id}:`, error);
    } finally {
      setLoadingMcpTools(prev => ({ ...prev, [id]: false }));
    }
  };

  // Load saved agent and fetch agents on mount
  useEffect(() => {
    try {
      const savedAgentData = localStorage.getItem("selectedAgent");
      if (savedAgentData) {
        const savedAgent = JSON.parse(savedAgentData) as Agent;
        setSelectedAgent(savedAgent);
      
        console.log(
          "Restored selected agent from localStorage:",
          savedAgent.name,
        );
      }
    } catch (error) {
      console.error("Error loading saved agent:", error);
    }
    
    fetchAgents();
    fetchMcpConfigs();

    const handlePopoverOpened = () => {
      console.log("Agent popover opened, refreshing agent list");
      fetchAgents();
      fetchMcpConfigs();
      setShowAgentList(false); // Show agent list by default on open
      setShowMcpServerTools(false); // Hide MCP server tools on open
      setSelectedMcpServer(null); // Reset selected MCP server
      
      // Reset dropdown states when popover opens
      setShowBuiltInTools(true);
      setShowAgentTools(true);
      setShowMcpServersSection(true);
    };

    // Listen for custom events for agent list updates
    const handleAgentListUpdated = () => {
      console.log("Agent list updated, refreshing agent list");
      fetchAgents();
    };

    const handleMcpServersUpdated = () => fetchMcpConfigs();


    window.addEventListener("agent-popover-opened", handlePopoverOpened);
    window.addEventListener("agent-list-updated", handleAgentListUpdated);
    window.addEventListener("mcp-servers-updated", handleMcpServersUpdated);

    window.addEventListener("focus", handlePopoverOpened);

    let cleanup: (() => void) | undefined;
    if (window.electronAPI && window.electronAPI.onAgentListUpdated) {
      cleanup = window.electronAPI.onAgentListUpdated(() => fetchAgents());
    }
    return () => {
      window.removeEventListener("agent-popover-opened", handlePopoverOpened);
      window.removeEventListener("agent-list-updated", handleAgentListUpdated);
      window.removeEventListener("mcp-servers-updated", handleMcpServersUpdated);
      window.removeEventListener("focus", handlePopoverOpened);
      cleanup?.();
    };
  }, []);

  // Set default agent when agents are loaded and no agent is selected
  useEffect(() => {
    if (availableAgents.length > 0 && !selectedAgent) {
      const defaultAgent = availableAgents.find(agent => agent.id === "DefaultAssistant");
      if (defaultAgent) {
        setSelectedAgent(defaultAgent);
        localStorage.setItem("selectedAgent", JSON.stringify(defaultAgent));
        console.log("Set default agent: DefaultAssistant");
      }
    }
  }, [availableAgents, selectedAgent]);

  // Recalculate MCP tools enabled state when selected agent changes
  useEffect(() => {
    if (selectedAgent && Object.keys(mcpServerTools).length > 0) {
      console.log("Recalculating MCP tools enabled state for agent:", selectedAgent.name);
      const newMcpToolsEnabled: Record<string, Record<string, boolean>> = {};
      
      Object.entries(mcpServerTools).forEach(([serverId, tools]) => {
        const enabledStatus: Record<string, boolean> = {};
        tools.forEach((tool: ToolDefinition) => {
          const isEnabled = selectedAgent.toolReferences?.some(ref => 
            ref.mcpName === serverId && ref.toolName === tool.name
          ) ?? false;
          enabledStatus[tool.name] = isEnabled;
        });
        newMcpToolsEnabled[serverId] = enabledStatus;
      });
      
      setMcpToolsEnabled(newMcpToolsEnabled);
    }
  }, [selectedAgent, mcpServerTools]);

  // Handle agent selection
  const handleAgentSelect = (agent: Agent) => {
    console.log(`Agent selected: ${agent.name}`);
    setSelectedAgent(agent);
  
    if (window.electronAPI) {
      try {
        localStorage.setItem("selectedAgent", JSON.stringify(agent));
        const event = new CustomEvent("agent-selected", { detail: { agent } });
        window.dispatchEvent(event);
        window.electronAPI.toggleAgentPopover(); // Close popover after selection
      } catch (error) {
        console.error("Error saving selected agent or closing popover:", error);
      }
    }
  };

  const handleBasicToolToggle = (toolId: string) => {
    setBasicTools(prev => prev.map(t => t.id === toolId ? { ...t, enabled: !t.enabled } : t));
    console.log(`Toggled basic tool ${toolId}`);
  };

  const handleAgentToolToggle = (toolId: string) => {
    setAgentTools(prev => prev.map(t => t.id === toolId ? { ...t, enabled: !t.enabled } : t));
    console.log(`Toggled agent tool ${toolId} for agent ${selectedAgent?.name}`);
  };

  const handleMcpServerConfigSelect = (id: string, config: MCPServerConfig) => {
    console.log(`Selected MCP server config: ${config.name || id}`, config);
    
    // Create a server object that matches our MCPServer interface
    const server: MCPServer = {
      id,
      name: config.name || id,
      description: config.description,
      status: config.enabled ? "online" : "offline",
      enabled: config.enabled,
      running: config.enabled, // Assume enabled configs are running
    };
    
    setSelectedMcpServer(server);
    setShowMcpServerTools(true);
    
    // Fetch tools if enabled
    if (config.enabled) {
      fetchMcpServerTools(id);
    }
  };

  const handleMcpToolToggle = async (serverId: string, toolName: string) => {
    if (!selectedAgent) {
      console.error("No agent selected for tool toggle");
      return;
    }

    const currentEnabled = mcpToolsEnabled[serverId]?.[toolName] ?? false;
    const newEnabled = !currentEnabled;
    
    console.log(`Toggling tool ${toolName} for server ${serverId} to ${newEnabled ? 'enabled' : 'disabled'}`);
    
    try {
      // Update agent's tool references
      const currentToolReferences = selectedAgent.toolReferences || [];
      const currentToolNames = selectedAgent.toolNames || [];
      
      let updatedToolReferences: ToolReference[];
      let updatedToolNames: string[];
      
      if (newEnabled) {
        // Add the tool
        const newToolRef: ToolReference = {
          mcpName: serverId,
          toolName: toolName,
          isBuiltIn: serverId === "Dev-MCP" || serverId === "codefox-mcp",
        };
        updatedToolReferences = [...currentToolReferences, newToolRef];
        updatedToolNames = [...currentToolNames, `${serverId}:${toolName}`];
      } else {
        // Remove the tool
        updatedToolReferences = currentToolReferences.filter(ref => 
          !(ref.mcpName === serverId && ref.toolName === toolName)
        );
        updatedToolNames = currentToolNames.filter(name => 
          name !== `${serverId}:${toolName}`
        );
      }

      const agentData = {
        id: selectedAgent.id,
        name: selectedAgent.name,
        description: selectedAgent.description,
        toolNames: updatedToolNames,
        toolReferences: updatedToolReferences,
      };

      const response = await fetch(`http://localhost:38000/api/agents/${selectedAgent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(agentData),
      });
      
      if (response.ok) {
        // Update local state if server update was successful
        const updatedAgent = { ...selectedAgent, toolNames: updatedToolNames, toolReferences: updatedToolReferences };
        
        // Update the agent store state directly without calling setSelectedAgent
        // to avoid triggering the automatic popover close
        useAgentStore.setState({ selectedAgent: updatedAgent });
        
        // Also update the agent in availableAgents list
        setAvailableAgents(availableAgents.map((agent: Agent) => 
          agent.id === selectedAgent.id ? updatedAgent : agent
        ));
        
        // Update MCP tools enabled state
        setMcpToolsEnabled(prev => ({
          ...prev,
          [serverId]: {
            ...prev[serverId],
            [toolName]: newEnabled
          }
        }));
        
        // Dispatch events to notify other components - removed agent-selected to prevent popover closing
        window.dispatchEvent(new CustomEvent("agent-list-updated"));
        
        console.log(`Successfully toggled tool ${toolName} to ${newEnabled ? 'enabled' : 'disabled'}`);
      } else {
        console.error(`Failed to update agent: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Error toggling MCP tool ${toolName}:`, error);
    }
  };

  const handleMcpServerToggleAll = async (serverId: string) => {
    if (!selectedAgent) {
      console.error("No agent selected for bulk tool toggle");
      return;
    }

    const serverTools = mcpServerTools[serverId] || [];
    if (serverTools.length === 0) return;

    // Check current state - if all tools are enabled, disable all; otherwise enable all
    const currentEnabledTools = Object.values(mcpToolsEnabled[serverId] || {}).filter(Boolean).length;
    const shouldEnableAll = currentEnabledTools < serverTools.length;
    
    console.log(`${shouldEnableAll ? 'Enabling' : 'Disabling'} all tools for server ${serverId}`);
    
    try {
      // Update agent's tool references
      const currentToolReferences = selectedAgent.toolReferences || [];
      const currentToolNames = selectedAgent.toolNames || [];
      
      let updatedToolReferences: ToolReference[];
      let updatedToolNames: string[];
      
      if (shouldEnableAll) {
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
        
        const newToolNames = serverTools
          .filter(tool => !existingServerTools.includes(tool.name))
          .map(tool => `${serverId}:${tool.name}`);
        
        updatedToolReferences = [...currentToolReferences, ...newToolRefs];
        updatedToolNames = [...currentToolNames, ...newToolNames];
      } else {
        // Remove all tools from this server
        updatedToolReferences = currentToolReferences.filter(ref => ref.mcpName !== serverId);
        updatedToolNames = currentToolNames.filter(name => !name.startsWith(`${serverId}:`));
      }

      const agentData = {
        id: selectedAgent.id,
        name: selectedAgent.name,
        description: selectedAgent.description,
        toolNames: updatedToolNames,
        toolReferences: updatedToolReferences,
      };

      const response = await fetch(`http://localhost:38000/api/agents/${selectedAgent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(agentData),
      });
      
      if (response.ok) {
        // Update local state if server update was successful
        const updatedAgent = { ...selectedAgent, toolNames: updatedToolNames, toolReferences: updatedToolReferences };
        
        // Update the agent store state directly without calling setSelectedAgent
        // to avoid triggering the automatic popover close
        useAgentStore.setState({ selectedAgent: updatedAgent });
        
        // Also update the agent in availableAgents list
        setAvailableAgents(availableAgents.map((agent: Agent) => 
          agent.id === selectedAgent.id ? updatedAgent : agent
        ));
        
        // Update MCP tools enabled state
        const newEnabledState: Record<string, boolean> = {};
        serverTools.forEach(tool => {
          newEnabledState[tool.name] = shouldEnableAll;
        });
        
        setMcpToolsEnabled(prev => ({
          ...prev,
          [serverId]: newEnabledState
        }));
        
        // Dispatch events to notify other components - removed agent-selected to prevent popover closing
        window.dispatchEvent(new CustomEvent("agent-list-updated"));
        
        console.log(`Successfully ${shouldEnableAll ? 'enabled' : 'disabled'} all tools for server ${serverId}`);
      } else {
        console.error(`Failed to update agent: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Error toggling all MCP tools for server ${serverId}:`, error);
    }
  };

  const ToolItem: React.FC<{ tool: Tool; onToggle: (id: string) => void }> = ({ tool, onToggle }) => (
    <div className="flex items-center justify-between p-2.5 hover:bg-primary/5 transition-all duration-200 rounded-md">
      <div className="font-medium text-sm truncate max-w-[180px]" title={tool.name}>{tool.name}</div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(tool.id);
        }}
        className={`relative h-5 w-10 rounded-full transition-all duration-300 focus:outline-none flex-shrink-0 ${
          tool.enabled ? "bg-primary" : "bg-gray-300"
        }`}
      >
        <span 
          className={`absolute left-0.5 top-0.5 h-4 w-4 transform rounded-full bg-white shadow-sm transition-all duration-300 ${
            tool.enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );

  const SectionHeader: React.FC<{ 
    title: string; 
    isExpanded: boolean; 
    onToggle: () => void;
    rightElement?: React.ReactNode;
  }> = ({ title, isExpanded, onToggle, rightElement }) => (
    <div 
      className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-all duration-200 rounded-md"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">
        <svg
          className={`w-4 h-4 text-muted-foreground transform transition-all duration-300 ${
            isExpanded ? "rotate-180" : "rotate-90"
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
        </svg>
        <span className="font-medium text-sm">{title}</span>
      </div>
      {rightElement}
    </div>
  );

  const ToolCountBadge: React.FC<{ serverId: string }> = ({ serverId }) => {
    const totalTools = mcpServerTools[serverId] || [];
    const config = mcpServerConfigs[serverId];
    
    if (!config?.enabled) {
      return (
        <span className="inline-flex items-center justify-center bg-gray-100 text-gray-500 text-xs font-medium px-1.5 py-0.5 rounded">
          Disabled
        </span>
      );
    }
    
    // For enabled servers, show enabled/total tools format
    const enabledCount = Object.values(mcpToolsEnabled[serverId] || {}).filter(Boolean).length;
    return (
      <span className="inline-flex items-center justify-center bg-blue-100 text-blue-800 text-xs font-medium px-1.5 py-0.5 ml-2 rounded">
        {enabledCount} / {totalTools.length} tools
      </span>
    );
  };

  // Handle click outside to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        if (window.electronAPI) {
          window.electronAPI.toggleAgentPopover();
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (window.electronAPI) {
          window.electronAPI.toggleAgentPopover();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="relative" ref={popoverRef}>
      {/* Arrow pointing to the trigger button */}
      <div
        className="absolute -top-2 left-5 h-2 w-4 overflow-hidden"
        style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}
      >
        <div className="bg-border absolute inset-0"></div>
      </div>
      <div
        className="absolute -top-[7px] left-[22px] h-2 w-3 overflow-hidden"
        style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}
      >
        <div className="bg-background absolute inset-0"></div>
      </div>

      <div 
        className="bg-background border-border w-72 rounded-xl border p-3"
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside the popover from bubbling up
      >
        <div className="space-y-3">
          {/* Agent Selector Section */}
          <div className="border-border border rounded-lg">
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-all duration-200 rounded-md"
              onClick={() => setShowAgentList(!showAgentList)}
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`w-4 h-4 text-muted-foreground transform transition-all duration-300 ${
                    showAgentList ? "rotate-180" : "rotate-90"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
                <svg 
                  className="w-4 h-4 text-primary" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Current Agent</div>
                  <div className="text-sm font-medium">
                    {selectedAgent ? selectedAgent.name : "No Agent Selected"}
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Selection List (Collapsible) */}
            {showAgentList && (
              <div 
                className="max-h-60 overflow-y-auto bg-muted/5 border-t border-border transition-all duration-300"
              >
                {/* List of Agents */}
                {availableAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`cursor-pointer p-3 transition-all duration-200 rounded-md ${
                      selectedAgent?.id === agent.id
                        ? "bg-primary/10 border-l-2 border-primary"
                        : "hover:bg-muted/30"
                    }`}
                    onClick={() => handleAgentSelect(agent)}
                  >
                    <div className="flex justify-between items-center">
                      <div className="font-medium text-sm">{agent.name}</div>
                      <div className="flex items-center gap-2">
                        {selectedAgent?.id === agent.id && (
                          <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        
          {/* Tool Sections Container - Only shown if agent list is NOT visible */}
          {!showAgentList && (
            <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
              {/* Built-in Tools Section with dropdown */}
              <div className="border-border border rounded-lg">
                <SectionHeader 
                  title="Built-in Tools" 
                  isExpanded={showBuiltInTools} 
                  onToggle={() => setShowBuiltInTools(!showBuiltInTools)} 
                />
                
                {showBuiltInTools && (
                  <div className="border-t border-border transition-all duration-300">
                    {basicTools.map((tool) => (
                      <ToolItem key={tool.id} tool={tool} onToggle={handleBasicToolToggle} />
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Agent Tools (MCP) Section with dropdown */}
              {selectedAgent && agentTools.length > 0 && (
                <div className="border-border border rounded-lg">
                  <SectionHeader 
                    title={`${selectedAgent.name} Tools`} 
                    isExpanded={showAgentTools} 
                    onToggle={() => setShowAgentTools(!showAgentTools)} 
                  />
                  
                  {showAgentTools && (
                    <div className="border-t border-border transition-all duration-300">
                      {agentTools.map((tool) => (
                        <ToolItem key={tool.id} tool={tool} onToggle={handleAgentToolToggle} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* MCP Server Selection Section with dropdown */}
              <div className="border-border border rounded-lg">
                <SectionHeader 
                  title="MCP Servers" 
                  isExpanded={showMcpServersSection} 
                  onToggle={() => {
                    if (selectedMcpServer && showMcpServerTools) {
                      setSelectedMcpServer(null);
                      setShowMcpServerTools(false);
                    } else {
                      setShowMcpServersSection(!showMcpServersSection);
                    }
                  }}
                  rightElement={
                    selectedMcpServer && showMcpServerTools ? (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent triggering the section toggle
                          setSelectedMcpServer(null);
                          setShowMcpServerTools(false);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 transition-colors duration-200 rounded"
                      >
                        Back
                      </button>
                    ) : null
                  }
                />
                
                {showMcpServersSection && (
                  <div className="border-t border-border transition-all duration-300">
                    {loadingMcpConfigs ? (
                      <div className="flex justify-center p-4">
                        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
                      </div>
                    ) : !showMcpServerTools ? (
                      <div>
                        {Object.keys(mcpServerConfigs).length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            No MCP servers configured
                          </div>
                        ) : (
                          Object.entries(mcpServerConfigs)
                            .sort(([, a], [, b]) => {
                              // Sort enabled servers to the top
                              if (a.enabled && !b.enabled) return -1;
                              if (!a.enabled && b.enabled) return 1;
                              // If both have same enabled status, sort by name
                              return (a.name || "").localeCompare(b.name || "");
                            })
                            .map(([id, config]) => (
                            <div
                              key={id}
                              onClick={() => config.enabled && handleMcpServerConfigSelect(id, config)}
                              className={`flex items-center justify-between p-2.5 cursor-pointer transition-all duration-200 rounded-md ${
                                !config.enabled 
                                  ? "opacity-50 cursor-not-allowed" 
                                  : "hover:bg-muted/30"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className={`w-2 h-2 rounded-full ${config.enabled ? "bg-emerald-500" : "bg-gray-400"} animate-pulse flex-shrink-0`}></div>
                                <span className="font-medium text-sm truncate" title={config.name || id}>{config.name || id}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <ToolCountBadge serverId={id} />
                                {config.enabled && (
                                  <svg 
                                    className="w-4 h-4 text-muted-foreground"
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                                  </svg>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : selectedMcpServer && (
                      <div>
                        <div className="flex items-center justify-between p-2 border-b border-border">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className={`w-2 h-2 rounded-full ${selectedMcpServer.enabled ? "bg-emerald-500" : "bg-gray-400"} animate-pulse flex-shrink-0`}></div>
                            <span className="font-medium text-sm truncate" title={selectedMcpServer.name}>{selectedMcpServer.name}</span>
                          </div>
                          {selectedMcpServer.enabled && mcpServerTools[selectedMcpServer.id]?.length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMcpServerToggleAll(selectedMcpServer.id);
                              }}
                              className="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 rounded transition-colors duration-200"
                            >
                              {(() => {
                                const currentEnabledTools = Object.values(mcpToolsEnabled[selectedMcpServer.id] || {}).filter(Boolean).length;
                                const totalTools = mcpServerTools[selectedMcpServer.id]?.length || 0;
                                return currentEnabledTools === totalTools ? "Disable All" : "Enable All";
                              })()}
                            </button>
                          )}
                        </div>

                        <div>
                          {(() => {
                            if (!selectedMcpServer.enabled) {
                              return (
                                <div className="text-muted-foreground text-center p-3 text-sm">
                                  <div className="mb-2">MCP server is disabled</div>
                                  <div className="text-xs text-muted-foreground/70">
                                    Enable this server in settings to access its tools
                                  </div>
                                </div>
                              );
                            }

                            if (loadingMcpTools[selectedMcpServer.id]) {
                              return (
                                <div className="flex justify-center p-4">
                                  <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
                                </div>
                              );
                            }

                            const serverTools = mcpServerTools[selectedMcpServer.id] || [];
                            console.log(`Rendering tools for ${selectedMcpServer.name} (${selectedMcpServer.id}):`, serverTools);
                            
                            if (serverTools.length > 0) {
                              return serverTools.map((tool, index) => (
                                <div key={tool.name || index} className="flex items-center justify-between p-2.5 hover:bg-primary/5 transition-all duration-200 rounded-md">
                                  <div className="font-medium text-sm truncate max-w-[180px]" title={tool.name}>{tool.name}</div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMcpToolToggle(selectedMcpServer.id, tool.name);
                                    }}
                                    className={`relative h-5 w-10 rounded-full transition-all duration-300 focus:outline-none flex-shrink-0 ${
                                      mcpToolsEnabled[selectedMcpServer.id]?.[tool.name] ?? true ? "bg-primary" : "bg-gray-300"
                                    }`}
                                  >
                                    <span 
                                      className={`absolute left-0.5 top-0.5 h-4 w-4 transform rounded-full bg-white shadow-sm transition-all duration-300 ${
                                        mcpToolsEnabled[selectedMcpServer.id]?.[tool.name] ?? true ? "translate-x-5" : "translate-x-0"
                                      }`}
                                    />
                                  </button>
                                </div>
                              ));
                            } else {
                              return (
                                <div className="text-muted-foreground text-center p-3 text-sm">
                                  <div className="mb-2">No tools available for this server</div>
                                  <div className="text-xs text-muted-foreground/70">
                                    Server ID: {selectedMcpServer.id}<br />
                                    Enabled: {selectedMcpServer.enabled ? "Yes" : "No"}
                                  </div>
                                </div>
                              );
                            }
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}