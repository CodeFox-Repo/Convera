import React, { useEffect, useState } from "react";

// Define TypeScript interfaces for API responses
interface ServerApiResponse {
  status: string;
  servers: ServerData[];
}

interface ToolsApiResponse {
  status: string;
  tools: ToolData[];
}

interface ServerData {
  id: string;
  name: string;
  description?: string;
  running?: boolean;
  enabled?: boolean;
  toolCount?: number;
  serverUrl?: string | null;
  kind?: string;
  url?: string;
  command?: string;
}

interface ToolData {
  id?: string;
  name: string;
  description?: string;
  enabled?: boolean;
  parameters?: Record<string, unknown>;
}

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
export default function AgentPopover() {
  const [agents, setAgents] = useState<Agent[]>([]); 
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [basicTools, setBasicTools] = useState<Tool[]>(mockBasicToolsData);
  const [agentTools, setAgentTools] = useState<Tool[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [mcpServerTools, setMcpServerTools] = useState<Tool[]>([]);
  const [selectedMcpServer, setSelectedMcpServer] = useState<MCPServer | null>(null);
  const [showMcpServerTools, setShowMcpServerTools] = useState(false);
  const [showAgentList, setShowAgentList] = useState(true);
  const [loadingMcpServers, setLoadingMcpServers] = useState(true);
  
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
  
  // Function to fetch MCP servers
  const fetchMcpServers = async () => {
    try {
      setLoadingMcpServers(true);
      console.log("Fetching MCP servers...");
      const response = await fetch("http://localhost:38000/api/mcp/servers");
      if (response.ok) {
        const data = await response.json() as ServerApiResponse;
        console.log("Full server response data:", data);
        if (data.status === "success" && Array.isArray(data.servers)) {
          console.log(`Loaded ${data.servers.length} MCP servers:`, data.servers);
          // Map the servers and add status property based on running state
          const serversWithStatus: MCPServer[] = data.servers.map((server: ServerData) => {
            console.log("Server data:", server);
            return {
              ...server,
              status: server.running ? "online" : "offline",
              // Ensure name is set properly
              name: server.name || `Server ${server.id}`
            };
          });
          setMcpServers(serversWithStatus);
          
          // Fetch tools for each server
          const allServerTools: Tool[] = [];
          for (const server of serversWithStatus) {
            if (server.running) {
              try {
                console.log(`Fetching tools for server ${server.id} (${server.name})...`);
                const toolsResponse = await fetch(`http://localhost:38000/api/mcp/server/${server.id}/tools`);
                if (toolsResponse.ok) {
                  const toolsData = await toolsResponse.json();
                  console.log(`Full tools response for server ${server.id}:`, toolsData);
                  
                  // Handle different response formats
                  let toolsList: ToolData[] = [];
                  
                  // Check if it's the standard API response format with status and tools
                  if (typeof toolsData === 'object' && 
                      toolsData !== null && 
                      'status' in toolsData && 
                      'tools' in toolsData && 
                      Array.isArray((toolsData as ToolsApiResponse).tools)) {
                    toolsList = (toolsData as ToolsApiResponse).tools;
                  } 
                  // Check if it's a direct array of tools
                  else if (Array.isArray(toolsData)) {
                    toolsList = toolsData as ToolData[];
                  }
                  // Check if it's an object with tool entries
                  else if (toolsData && typeof toolsData === 'object') {
                    const objData = toolsData as Record<string, unknown>;
                    toolsList = Object.keys(objData)
                      .filter(key => key !== 'status')
                      .map(key => {
                        const toolValue = objData[key];
                        if (typeof toolValue === 'object' && toolValue !== null) {
                          return { ...toolValue as Record<string, unknown>, name: key } as ToolData;
                        }
                        return { name: key } as ToolData;
                      });
                  }
                  
                  if (toolsList.length > 0) {
                    console.log(`Processed ${toolsList.length} tools for server ${server.id}:`, toolsList);
                    const serverTools = toolsList.map((tool: ToolData) => ({
                      id: tool.id || tool.name,
                      name: tool.name,
                      description: tool.description || "",
                      enabled: tool.enabled !== undefined ? tool.enabled : true,
                      serverId: server.id
                    }));
                    allServerTools.push(...serverTools);
                  } else {
                    console.warn(`No tools found for server ${server.id} in response:`, toolsData);
                  }
                } else {
                  console.error(`Failed to fetch tools for server ${server.id}: ${toolsResponse.status}`);
                }
              } catch (error) {
                console.error(`Error fetching tools for server ${server.id}:`, error);
              }
            }
          }
          console.log("All server tools:", allServerTools);
          setMcpServerTools(allServerTools);
        }
      } else {
        console.error("Failed to fetch MCP servers:", response.status);
      }
    } catch (error) {
      console.error("Error fetching MCP servers:", error);
    } finally {
      setLoadingMcpServers(false);
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
    fetchMcpServers();

    const handlePopoverOpened = () => {
      console.log("Agent popover opened, refreshing agent list");
      fetchAgents();
      fetchMcpServers();
      setShowAgentList(true); // Show agent list by default on open
      setShowMcpServerTools(false); // Hide MCP server tools on open
      setSelectedMcpServer(null); // Reset selected MCP server
      
      // Reset dropdown states when popover opens
      setShowBuiltInTools(true);
      setShowAgentTools(true);
      setShowMcpServersSection(true);
    };
    const handleAgentListUpdated = () => fetchAgents();
    const handleMcpServersUpdated = () => fetchMcpServers();

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

  const handleMcpServerSelect = async (server: MCPServer) => {
    console.log(`Selected MCP server: ${server.name}`, server);
    setSelectedMcpServer(server);
    
    // Fetch tools specifically for this server when selected
    if (server.running || server.status === "online") {
      try {
        console.log(`Fetching tools for selected server ${server.id}...`);
        // Try different endpoint formats to ensure we get the tools
        let toolsEndpoint = `http://localhost:38000/api/mcp/server/${server.id}/tools`;
        console.log(`Trying endpoint: ${toolsEndpoint}`);
        
        let toolsResponse = await fetch(toolsEndpoint);
        
        // If the first attempt fails, try an alternative endpoint
        if (!toolsResponse.ok) {
          console.warn(`First tools endpoint failed with status: ${toolsResponse.status}`);
          // Try alternative endpoint structure
          toolsEndpoint = `http://localhost:38000/api/mcp/servers/${server.id}/tools`;
          console.log(`Trying alternative endpoint: ${toolsEndpoint}`);
          toolsResponse = await fetch(toolsEndpoint);
        }
        
        if (toolsResponse.ok) {
          const toolsData = await toolsResponse.json();
          console.log(`Tools data for server ${server.id}:`, toolsData);
          
          // Handle different response formats
          let toolsList: ToolData[] = [];
          
          // Check if it's the standard API response format with status and tools
          if (typeof toolsData === 'object' && 
              toolsData !== null && 
              'status' in toolsData && 
              'tools' in toolsData && 
              Array.isArray((toolsData as ToolsApiResponse).tools)) {
            toolsList = (toolsData as ToolsApiResponse).tools;
          } 
          // Check if it's a direct array of tools
          else if (Array.isArray(toolsData)) {
            toolsList = toolsData as ToolData[];
          }
          // Check if it's an object with tool entries
          else if (toolsData && typeof toolsData === 'object') {
            const objData = toolsData as Record<string, unknown>;
            toolsList = Object.keys(objData)
              .filter(key => key !== 'status')
              .map(key => {
                const toolValue = objData[key];
                if (typeof toolValue === 'object' && toolValue !== null) {
                  return { ...toolValue as Record<string, unknown>, name: key } as ToolData;
                }
                return { name: key } as ToolData;
              });
          }
          
          console.log(`Processed tools list for server ${server.id}:`, toolsList);
          
          if (toolsList.length > 0) {
            const serverTools = toolsList.map((tool: ToolData) => ({
              id: tool.id || tool.name || `tool-${Math.random().toString(36).substring(2, 9)}`,
              name: tool.name || "Unnamed Tool",
              description: tool.description || "",
              enabled: tool.enabled !== undefined ? tool.enabled : true,
              serverId: server.id
            }));
            
            console.log(`Mapped server tools:`, serverTools);
            
            // Update only this server's tools in the state
            setMcpServerTools(prev => {
              // Remove existing tools for this server
              const otherServerTools = prev.filter(t => t.serverId !== server.id);
              // Add the newly fetched tools
              const updatedTools = [...otherServerTools, ...serverTools];
              console.log(`Updated mcpServerTools:`, updatedTools);
              return updatedTools;
            });
          } else {
            console.warn(`No tools found for server ${server.id}`);
            // Add at least one dummy tool if no tools found (for testing)
            const dummyTool = {
              id: `dummy-${server.id}`,
              name: "Default Tool",
              description: "This is a placeholder tool",
              enabled: true,
              serverId: server.id
            };
            
            setMcpServerTools(prev => {
              // Remove existing tools for this server
              const otherServerTools = prev.filter(t => t.serverId !== server.id);
              // Add the dummy tool
              return [...otherServerTools, dummyTool];
            });
          }
        } else {
          console.error(`Failed to fetch tools for server ${server.id}: ${toolsResponse.status} ${toolsResponse.statusText}`);
          // Add a dummy tool to help diagnose the issue
          setMcpServerTools(prev => [...prev, {
            id: `dummy-${server.id}`,
            name: "API Error",
            description: `Error ${toolsResponse.status} fetching tools`,
            enabled: false,
            serverId: server.id
          }]);
        }
      } catch (error) {
        console.error(`Error fetching tools for server ${server.id} on select:`, error);
        // Add an error indicator tool
        setMcpServerTools(prev => [...prev, {
          id: `error-${server.id}`,
          name: "Error Loading Tools",
          description: error instanceof Error ? error.message : "Unknown error",
          enabled: false,
          serverId: server.id
        }]);
      }
    } else {
      console.warn(`Server ${server.id} is not running, no tools will be fetched`);
    }
    
    setShowMcpServerTools(true);
    
    // Trigger a UI update for the tools section
    setTimeout(() => {
      console.log("Current state of mcpServerTools:", mcpServerTools);
      console.log(`Tools for server ${server.id}:`, mcpServerTools.filter(t => t.serverId === server.id));
    }, 100);
  };

  const handleMcpServerToolToggle = async (toolId: string) => {
    // Find the tool and toggle its enabled state
    const tool = mcpServerTools.find(t => t.id === toolId);
    if (!tool || !tool.serverId) {
      console.error(`Tool not found or missing serverId: ${toolId}`);
      return;
    }
    
    console.log(`Toggling tool ${tool.name} (${toolId}) for server ${tool.serverId}...`);
    
    try {
      const newEnabledState = !tool.enabled;
      
      // Send the updated state to the server
      // The API might use name rather than id for some tools
      const endpoint = `http://localhost:38000/api/mcp/server/${tool.serverId}/tool/${tool.name || toolId}`;
      console.log(`Sending request to: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: newEnabledState }),
      });
      
      if (response.ok) {
        // Update the local state if the server update was successful
        setMcpServerTools(prev => 
          prev.map(t => t.id === toolId ? { ...t, enabled: newEnabledState } : t)
        );
        console.log(`Successfully toggled tool ${toolId} to ${newEnabledState ? 'enabled' : 'disabled'}`);
      } else {
        console.error(`Failed to toggle tool ${toolId}: ${response.status} ${response.statusText}`);
        // Try with the alternative ID (name) if the first attempt failed
        if (tool.name && tool.name !== toolId) {
          const altEndpoint = `http://localhost:38000/api/mcp/server/${tool.serverId}/tool/${tool.name}`;
          console.log(`Trying alternative endpoint: ${altEndpoint}`);
          
          const altResponse = await fetch(altEndpoint, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ enabled: newEnabledState }),
          });
          
          if (altResponse.ok) {
            setMcpServerTools(prev => 
              prev.map(t => t.id === toolId ? { ...t, enabled: newEnabledState } : t)
            );
            console.log(`Successfully toggled tool ${toolId} using name ${tool.name}`);
          } else {
            console.error(`Failed alternative toggle attempt: ${altResponse.status} ${altResponse.statusText}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error toggling MCP server tool ${toolId}:`, error);
    }
  };

  const handleEnableAllServerTools = async (serverId: string, enabled: boolean) => {
    console.log(`${enabled ? 'Enabling' : 'Disabling'} all tools for MCP server ${serverId}...`);
    
    try {
      // Send the request to update all tools for this server
      const endpoint = `http://localhost:38000/api/mcp/server/${serverId}/tools`;
      console.log(`Sending request to: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      });
      
      if (response.ok) {
        // Update local state if server update was successful
        setMcpServerTools(prev => 
          prev.map(tool => tool.serverId === serverId ? { ...tool, enabled } : tool)
        );
        console.log(`Successfully ${enabled ? 'enabled' : 'disabled'} all tools for MCP server ${serverId}`);
        
        // Refresh tool list to ensure the UI is in sync with the server
        await handleMcpServerSelect(selectedMcpServer!);
      } else {
        console.error(`Failed to ${enabled ? 'enable' : 'disable'} all tools: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Error ${enabled ? 'enabling' : 'disabling'} all tools for server ${serverId}:`, error);
    }
  };

  const getServerTools = (serverId: string) => {
    console.log(`Getting tools for server ${serverId}...`);
    console.log(`All available tools:`, mcpServerTools);
    
    const tools = mcpServerTools.filter(tool => tool.serverId === serverId);
    console.log(`Found ${tools.length} tools for server ${serverId}:`, tools);
    return tools;
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
                    {loadingMcpServers ? (
                      <div className="flex justify-center p-4">
                        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
                      </div>
                    ) : !showMcpServerTools ? (
                      <div>
                        {mcpServers.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            No MCP servers available
                          </div>
                        ) : (
                          mcpServers.map(server => (
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
                          ))
                        )}
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
                          {(() => {
                            // Add debugging info for tools display
                            const serverTools = getServerTools(selectedMcpServer.id);
                            console.log(`Rendering tools for ${selectedMcpServer.name} (${selectedMcpServer.id}):`, serverTools);
                            
                            if (serverTools.length > 0) {
                              return serverTools.map(tool => (
                                <ToolItem 
                                  key={tool.id} 
                                  tool={tool} 
                                  onToggle={handleMcpServerToolToggle} 
                                />
                              ));
                            } else {
                              // No tools found
                              return (
                                <div className="text-muted-foreground text-center p-3 text-sm">
                                  <div className="mb-2">No tools available for this server</div>
                                  <div className="text-xs text-muted-foreground/70">
                                    Server ID: {selectedMcpServer.id}<br />
                                    Status: {selectedMcpServer.status}<br />
                                    Running: {selectedMcpServer.running ? "Yes" : "No"}
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
