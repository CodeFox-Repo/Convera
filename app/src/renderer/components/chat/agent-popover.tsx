import React, { useEffect, useState } from "react";

interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  iconUrl?: string;
}

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
  description: string;
  status: "online" | "offline" | "connecting";
}

const mockAgentsData: Agent[] = [
  { id: "agent-1", name: "Creative Writer", description: "Assists with writing creative content.", category: "Writing" },
  { id: "agent-2", name: "Code Helper", description: "Helps with coding questions and snippets.", category: "Development" },
  { id: "agent-3", name: "Research Assistant", description: "Gathers and summarizes information.", category: "Research" },
];

const mockBasicToolsData: Tool[] = [
  { id: "websearch", name: "Web Search", enabled: true, description: "Enable web searching capabilities." },
  { id: "thinking", name: "Thinking Indicator", enabled: false, description: "Show thinking animations." },
];

// MCP server mock data
const mockMcpServersData: MCPServer[] = [
  { id: "mcp-server-1", name: "Primary MCP", description: "Main processing server", status: "online" },
  { id: "mcp-server-2", name: "Research MCP", description: "Advanced research capabilities", status: "online" },
  { id: "mcp-server-3", name: "Backup MCP", description: "Failover server", status: "offline" },
];

// MCP server tools organized by server ID
const mockMcpServerToolsData: Tool[] = [
  // Primary MCP Server Tools
  { id: "mcp-global-1", name: "Knowledge Base", enabled: true, description: "Accesses the main knowledge base.", serverId: "mcp-server-1" },
  { id: "mcp-global-2", name: "Performance Monitor", enabled: false, description: "Tracks server performance.", serverId: "mcp-server-1" },
  { id: "mcp-global-3", name: "Code Interpreter", enabled: true, description: "Executes and analyzes code.", serverId: "mcp-server-1" },
  
  // Research MCP Server Tools
  { id: "research-tool-1", name: "Academic Search", enabled: true, description: "Searches academic databases.", serverId: "mcp-server-2" },
  { id: "research-tool-2", name: "Data Analysis", enabled: false, description: "Analyzes complex datasets.", serverId: "mcp-server-2" },
  { id: "research-tool-3", name: "Citation Generator", enabled: false, description: "Generates formatted citations.", serverId: "mcp-server-2" },
  
  // Backup MCP Server Tools
  { id: "backup-tool-1", name: "Memory Backup", enabled: false, description: "Creates conversation backups.", serverId: "mcp-server-3" },
  { id: "backup-tool-2", name: "State Recovery", enabled: false, description: "Recovers from system failures.", serverId: "mcp-server-3" },
];

/**
 * AgentPopover component to be displayed in a dedicated BrowserWindow
 */
export default function AgentPopover() {
  const [agents, setAgents] = useState<Agent[]>(mockAgentsData); // Using mock agents for now
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [basicTools, setBasicTools] = useState<Tool[]>(mockBasicToolsData);
  const [agentTools, setAgentTools] = useState<Tool[]>([]); // Start empty, populate on agent select
  const [mcpServers] = useState<MCPServer[]>(mockMcpServersData);
  const [mcpServerTools, setMcpServerTools] = useState<Tool[]>(mockMcpServerToolsData);
  const [selectedMcpServer, setSelectedMcpServer] = useState<MCPServer | null>(null);
  const [showMcpServerTools, setShowMcpServerTools] = useState(false);
  const [showAgentList, setShowAgentList] = useState(true); // Show agent list by default
  
  // Dropdown state variables
  const [showBuiltInTools, setShowBuiltInTools] = useState(true);
  const [showAgentTools, setShowAgentTools] = useState(true);
  const [showMcpServersSection, setShowMcpServersSection] = useState(true);

  // Function to fetch agents from the server
  const fetchAgents = async () => {
    try {
      console.log("Fetching available agents...");
      const response = await fetch("http://localhost:38000/api/agents");
      if (response.ok) {
        const data = await response.json();
        if (data.status === "success" && Array.isArray(data.agents)) {
          console.log(`Loaded ${data.agents.length} agents`);
          setAgents(data.agents);
        }
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
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

    const handlePopoverOpened = () => {
      console.log("Agent popover opened, refreshing agent list");
      fetchAgents();
      setShowAgentList(true); // Show agent list by default on open
      setShowMcpServerTools(false); // Hide MCP server tools on open
      setSelectedMcpServer(null); // Reset selected MCP server
      
      // Reset dropdown states when popover opens
      setShowBuiltInTools(true);
      setShowAgentTools(true);
      setShowMcpServersSection(true);
    };
    const handleAgentListUpdated = () => fetchAgents();

    window.addEventListener("agent-popover-opened", handlePopoverOpened);
    window.addEventListener("agent-list-updated", handleAgentListUpdated);
    window.addEventListener("focus", handlePopoverOpened);

    let cleanup: (() => void) | undefined;
    if (window.electronAPI && window.electronAPI.onAgentListUpdated) {
      cleanup = window.electronAPI.onAgentListUpdated(() => fetchAgents());
    }
    return () => {
      window.removeEventListener("agent-popover-opened", handlePopoverOpened);
      window.removeEventListener("agent-list-updated", handleAgentListUpdated);
      window.removeEventListener("focus", handlePopoverOpened);
      cleanup?.();
    };
  }, []);

  // Handle agent selection
  const handleAgentSelect = (agent: Agent | null) => {
    console.log(`Agent selected: ${agent?.name || "Default Assistant"}`);
    setSelectedAgent(agent);
    // setShowAgentList(false); // No longer needed here as popover will close

    
      setAgentTools([]); 
    

    if (window.electronAPI) {
      try {
        if (agent) {
          localStorage.setItem("selectedAgent", JSON.stringify(agent));
        } else {
          localStorage.removeItem("selectedAgent");
        }
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

  const handleMcpServerSelect = (server: MCPServer) => {
    setSelectedMcpServer(server);
    
    setShowMcpServerTools(true);
    console.log(`Selected MCP server: ${server.name}`);
  };

  const handleMcpServerToolToggle = (toolId: string) => {
    setMcpServerTools(prev => prev.map(t => t.id === toolId ? { ...t, enabled: !t.enabled } : t));
    console.log(`Toggled MCP server tool ${toolId}`);
  };

  const handleEnableAllServerTools = (serverId: string, enabled: boolean) => {
    setMcpServerTools(prev => 
      prev.map(tool => tool.serverId === serverId ? { ...tool, enabled } : tool)
    );
    console.log(`${enabled ? 'Enabled' : 'Disabled'} all tools for MCP server ${serverId}`);
  };

  const getServerTools = (serverId: string) => {
    return mcpServerTools.filter(tool => tool.serverId === serverId);
  };

  const getEnabledServerTools = (serverId: string) => {
    return mcpServerTools.filter(tool => tool.serverId === serverId && tool.enabled);
  };

  const areAllServerToolsEnabled = (serverId: string) => {
    const serverTools = getServerTools(serverId);
    return serverTools.length > 0 && serverTools.every(tool => tool.enabled);
  };

  const ToolItem: React.FC<{ tool: Tool; onToggle: (id: string) => void }> = ({ tool, onToggle }) => (
    <div className="flex items-center justify-between p-2.5 hover:bg-primary/5 transition-all duration-200 rounded-md">
      <div className="font-medium text-sm">{tool.name}</div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(tool.id);
        }}
        className={`relative h-5 w-10 rounded-full transition-all duration-300 focus:outline-none ${
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

  const ServerStatusIndicator: React.FC<{ status: MCPServer['status'] }> = ({ status }) => {
    const statusColors = {
      online: "bg-emerald-500",
      offline: "bg-gray-400",
      connecting: "bg-amber-400"
    };
    
    return (
      <div className={`w-2 h-2 rounded-full ${statusColors[status]} animate-pulse`}></div>
    );
  };

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

  const CategoryTag: React.FC<{ category: string }> = ({ category }) => {
    const categoryColors: Record<string, string> = {
      "Writing": "bg-blue-100 text-blue-800",
      "Development": "bg-purple-100 text-purple-800",
      "Research": "bg-green-100 text-green-800",
      "default": "bg-gray-100 text-gray-800",
    };
    
    const colorClass = categoryColors[category] || categoryColors.default;
    
    return (
      <span className={`text-xs px-1.5 py-0.5 rounded ${colorClass}`}>
        {category}
      </span>
    );
  };

  const ToolCountBadge: React.FC<{ serverId: string }> = ({ serverId }) => {
    const enabledTools = getEnabledServerTools(serverId);
    const totalTools = getServerTools(serverId);
    const hasEnabledTools = enabledTools.length > 0;
    
    return (
      <div className="flex items-center gap-1.5">
        {hasEnabledTools ? (
          <span className="inline-flex items-center justify-center bg-green-100 text-green-800 text-xs font-medium px-1.5 py-0.5 rounded">
            {enabledTools.length}/{totalTools.length}
          </span>
        ) : (
          <span className="inline-flex items-center justify-center bg-gray-100 text-gray-500 text-xs font-medium px-1.5 py-0.5 rounded">
            Disabled
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="relative">
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

      <div className="bg-background border-border w-72 rounded-xl border p-3">
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
                    {selectedAgent ? selectedAgent.name : "Default Assistant"}
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Selection List (Collapsible) */}
            {showAgentList && (
              <div 
                className="max-h-60 overflow-y-auto bg-muted/5 border-t border-border transition-all duration-300"
              >
                {/* Default Assistant Option */}
                <div
                  className={`cursor-pointer p-3 transition-all duration-200 rounded-md ${
                    !selectedAgent
                      ? "bg-primary/10 border-l-2 border-primary"
                      : "hover:bg-muted/30"
                  }`}
                  onClick={() => handleAgentSelect(null)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">Default Assistant</div>
                    {!selectedAgent && (
                      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                      </svg>
                    )}
                  </div>
                </div>
                {/* List of Agents */}
                {agents.map((agent) => (
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
                        <CategoryTag category={agent.category} />
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
                    {!showMcpServerTools ? (
                      <div>
                        {mcpServers.map(server => (
                          <div
                            key={server.id}
                            onClick={() => server.status !== "offline" && handleMcpServerSelect(server)}
                            className={`flex items-center justify-between p-2.5 cursor-pointer transition-all duration-200 rounded-md ${
                              server.status === "offline" 
                                ? "opacity-50 cursor-not-allowed" 
                                : "hover:bg-muted/30"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <ServerStatusIndicator status={server.status} />
                              <span className="font-medium text-sm">{server.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <ToolCountBadge serverId={server.id} />
                              {server.status !== "offline" && (
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
                        ))}
                      </div>
                    ) : selectedMcpServer && (
                      <div>
                        <div className="flex items-center justify-between p-2 border-b border-border">
                          <div className="flex items-center gap-2">
                            <ServerStatusIndicator status={selectedMcpServer.status} />
                            <span className="font-medium text-sm">{selectedMcpServer.name}</span>
                          </div>
                          <button
                            onClick={() => handleEnableAllServerTools(
                              selectedMcpServer.id, 
                              !areAllServerToolsEnabled(selectedMcpServer.id)
                            )}
                            className={`px-2 py-1 text-xs rounded transition-all duration-200 ${
                              areAllServerToolsEnabled(selectedMcpServer.id)
                                ? "bg-muted hover:bg-muted/70 text-muted-foreground"
                                : "bg-primary hover:bg-primary/90 text-white"
                            }`}
                            disabled={selectedMcpServer.status === "offline"}
                          >
                            {areAllServerToolsEnabled(selectedMcpServer.id) ? "Disable All" : "Enable All"}
                          </button>
                        </div>

                        <div>
                          {getServerTools(selectedMcpServer.id).length > 0 ? (
                            getServerTools(selectedMcpServer.id).map(tool => (
                              <ToolItem 
                                key={tool.id} 
                                tool={tool} 
                                onToggle={handleMcpServerToolToggle} 
                              />
                            ))
                          ) : (
                            <div className="text-muted-foreground text-center p-3 text-sm">
                              No tools available
                            </div>
                          )}
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
