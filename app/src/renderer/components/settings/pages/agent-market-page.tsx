import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { getApiBaseUrl } from "@/renderer/libs/env";
import { Agent, useAgentStore } from "@/renderer/libs/stores/agent-store";
import {
  Bot,
  CheckCircle,
  Download,
  ExternalLink,
  Eye,
  Globe,
  Loader2,
  Plus,
  Search,
  Server,
  Tag,
  Trash2,
  User,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

interface MarketAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  predefined: boolean;
  selectedMCPs: string[];
  disableToolReferences?: Array<{
    mcpName: string;
    toolName: string;
    reason: string;
  }>;
  author?: {
    name: string;
    url?: string;
  };
  keywords?: string[];
  category?: string;
  iconUrl?: string;
  version?: string;
  createdAt: string;
  updatedAt: string;
  mcpInstallations?: Record<string, unknown>;
}


export function AgentMarketPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [marketAgents, setMarketAgents] = useState<MarketAgent[]>([]);
  const [installedAgents, setInstalledAgents] = useState<Set<string>>(
    new Set(),
  );
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [selectedAgent, setSelectedAgent] = useState<MarketAgent | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const { availableAgents, fetchAgents, createAgent, deleteAgent } =
    useAgentStore();

  // Helper function to get agent icon
  const getAgentIcon = (agent: MarketAgent) => {
    if (agent.iconUrl) {
      return (
        <img
          src={agent.iconUrl}
          alt={agent.name}
          className="h-10 w-10 object-contain rounded-md"
        />
      );
    }
    return <Bot className="h-10 w-10 text-muted-foreground" />;
  };

  // Fetch market agents and check installed status
  const fetchMarketAgents = async () => {
    try {
      setLoading(true);

      // Fetch available agents from agent market API
      const agentsResponse = await fetch(`${getApiBaseUrl()}/agent-market`);
      if (!agentsResponse.ok) {
        throw new Error("Failed to fetch market agents");
      }
      const agentsResult = await agentsResponse.json();

      // Transform the API response to our expected format
      const transformedAgents: MarketAgent[] = agentsResult.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item: any) => ({
          id: item.agentId,
          name: item.agentJson.name,
          description: item.agentJson.description,
          systemPrompt: item.agentJson.systemPrompt,
          predefined: item.agentJson.predefined,
          selectedMCPs: item.agentJson.selectedMCPs || [],
          disableToolReferences: item.agentJson.disableToolReferences || [],
          author: item.agentJson.author,
          keywords: item.agentJson.keywords || [],
          category: item.agentJson.category || "general",
          iconUrl: item.agentJson.iconUrl,
          version: item.agentJson.version || "1.0.0",
          createdAt: item.agentJson.createdAt || item.createdAt,
          updatedAt: item.agentJson.updatedAt || item.updatedAt,
          mcpInstallations: item.mcpInstallations,
        }),
      );

      setMarketAgents(transformedAgents);

      // Check which agents are already installed locally
      await fetchAgents();
      const installedAgentNames = new Set(
        availableAgents
          .filter((agent) => agent.predefined) // Market agents are marked as predefined
          .map((agent) => agent.name),
      );
      setInstalledAgents(installedAgentNames);
    } catch (error) {
      console.error("Error fetching market agents:", error);
      toast.error("Failed to load agent market");
    } finally {
      setLoading(false);
    }
  };

  // Load market agents on mount
  useEffect(() => {
    fetchMarketAgents();
  }, []);

  // Handle agent installation
  const handleInstall = async (agent: MarketAgent) => {
    setInstalling((prev) => new Set(prev).add(agent.id));

    try {
      // Create the agent locally
      const agentData = {
        id: `market-${agent.id}`,
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        selectedMCPs: agent.selectedMCPs,
        predefined: true, // Mark as predefined to indicate it's from market
        disableToolReferences: agent.disableToolReferences || [],
        metadata: {
          marketId: agent.id,
          version: agent.version,
          author: agent.author,
          keywords: agent.keywords,
          category: agent.category,
          installedAt: new Date().toISOString(),
        },
      };

      await createAgent(agentData as unknown as Agent);
      toast.success(`${agent.name} installed successfully!`);

      // Update installed agents state
      setInstalledAgents((prev) => new Set(prev).add(agent.name));
    } catch (error) {
      console.error(`Error installing ${agent.name}:`, error);
      toast.error(
        `Failed to install ${agent.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setInstalling((prev) => {
        const newSet = new Set(prev);
        newSet.delete(agent.id);
        return newSet;
      });
    }
  };

  // Handle agent uninstallation
  const handleUninstall = async (agent: MarketAgent) => {
    if (
      !window.confirm(`Are you sure you want to uninstall "${agent.name}"?`)
    ) {
      return;
    }

    try {
      // Find the local agent by name
      const localAgent = availableAgents.find(
        (a) => a.name === agent.name && a.predefined,
      );

      if (localAgent) {
        const success = await deleteAgent(localAgent.id);
        if (success) {
          toast.success(`${agent.name} uninstalled successfully!`);
          setInstalledAgents((prev) => {
            const newSet = new Set(prev);
            newSet.delete(agent.name);
            return newSet;
          });
        } else {
          throw new Error("Failed to uninstall agent");
        }
      } else {
        throw new Error("Agent not found locally");
      }
    } catch (error) {
      console.error(`Error uninstalling ${agent.name}:`, error);
      toast.error(
        `Failed to uninstall ${agent.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };


  // Filter agents and separate installed/available
  const allFilteredAgents = marketAgents.filter((agent) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      searchQuery === "" ||
      agent.name.toLowerCase().includes(searchLower) ||
      agent.description.toLowerCase().includes(searchLower) ||
      agent.author?.name.toLowerCase().includes(searchLower) ||
      agent.keywords?.some((keyword) =>
        keyword.toLowerCase().includes(searchLower),
      );

    return matchesSearch;
  });

  const installedFilteredAgents = allFilteredAgents.filter((agent) =>
    installedAgents.has(agent.name),
  );

  const availableFilteredAgents = allFilteredAgents.filter(
    (agent) => !installedAgents.has(agent.name),
  );

  // Show agent details modal
  const showAgentDetails = (agent: MarketAgent) => {
    setSelectedAgent(agent);
    setShowDetails(true);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Loading agent market...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show global empty state when no agents exist at all
  if (marketAgents.length === 0) {
    return (
      <div className="p-6">
        <div className="space-y-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              Agent Market
            </h1>
            <p className="text-muted-foreground">
              Discover and install pre-built AI agents for various tasks
            </p>
          </div>

          <div className="text-center py-16 border border-border rounded-lg">
            <Bot className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium mb-2">No agents available</h3>
            <p className="text-muted-foreground mb-6">
              Agents will appear here when they are added to the marketplace
            </p>
            <Button variant="outline">
              <ExternalLink className="h-4 w-4 mr-2" />
              Learn more about agent market
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Agent Market
          </h1>
          <p className="text-muted-foreground">
            Discover and install pre-built AI agents for various tasks
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Installed Agents Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">
              Installed ({installedFilteredAgents.length})
            </h2>
          </div>

          {installedFilteredAgents.length > 0 ? (
            <div className="space-y-2">
              {installedFilteredAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="p-3 border border-border rounded-lg hover:bg-muted/20 transition-colors group flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="relative">
                      {getAgentIcon(agent)}
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-600 rounded-full flex items-center justify-center">
                        <CheckCircle className="h-2.5 w-2.5 text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground truncate">
                          {agent.name}
                        </h3>
                        {agent.version && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            v{agent.version}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {agent.description}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        {agent.selectedMCPs &&
                          agent.selectedMCPs.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Server className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {agent.selectedMCPs.length} MCP server
                                {agent.selectedMCPs.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                          )}
                        {agent.author?.name && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground truncate">
                              {agent.author.name}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => showAgentDetails(agent)}
                      className="px-2"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUninstall(agent)}
                      className="text-muted-foreground hover:text-red-600 hover:border-red-300 px-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 border border-border rounded-lg bg-muted/20">
              <CheckCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-medium mb-1">No agents installed yet</h3>
              <p className="text-sm text-muted-foreground">
                Install agents from the marketplace below
              </p>
            </div>
          )}
        </div>

        {/* Available Agents Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">
              Available Agents ({availableFilteredAgents.length})
            </h2>
          </div>

          {availableFilteredAgents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableFilteredAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="p-4 border border-border rounded-lg hover:bg-muted/20 transition-colors group"
                >
                  <div className="flex flex-col gap-3">
                    {/* Header with icon, name, and action buttons */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {getAgentIcon(agent)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-foreground truncate">
                              {agent.name}
                            </h3>
                            {agent.version && (
                              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                v{agent.version}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {agent.author?.name && (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground truncate">
                                  {agent.author.name}
                                </span>
                                {agent.author.url && (
                                  <Globe className="h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => showAgentDetails(agent)}
                          className="px-2"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleInstall(agent)}
                          disabled={installing.has(agent.id)}
                          className="px-3"
                        >
                          {installing.has(agent.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-1" />
                              Install
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-5">
                      {agent.description}
                    </p>

                    {/* MCP Servers and Keywords */}
                    <div className="space-y-2">
                      {agent.selectedMCPs && agent.selectedMCPs.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Server className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-muted-foreground">
                            Uses {agent.selectedMCPs.length} MCP server
                            {agent.selectedMCPs.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}

                      {agent.keywords && agent.keywords.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <Tag className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <div className="flex flex-wrap gap-1">
                            {agent.keywords
                              .slice(0, 3)
                              .map((keyword, index) => (
                                <span
                                  key={index}
                                  className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded"
                                >
                                  {keyword}
                                </span>
                              ))}
                            {agent.keywords.length > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{agent.keywords.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-border rounded-lg bg-muted/20">
              <Plus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">
                {searchQuery
                  ? "No available agents match your search"
                  : "All agents are already installed"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? "Try adjusting your search terms"
                  : "Check back later for new agents"}
              </p>
            </div>
          )}
        </div>

        {/* Clear Search Button */}
        {searchQuery && (
          <div className="text-center">
            <Button
              variant="outline"
              onClick={() => setSearchQuery("")}
            >
              Clear search
            </Button>
          </div>
        )}
      </div>

      {/* Agent Details Modal */}
      {showDetails && selectedAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background border border-border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {getAgentIcon(selectedAgent)}
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {selectedAgent.name}
                    </h2>
                    <p className="text-muted-foreground">
                      {selectedAgent.description}
                    </p>
                    {selectedAgent.version && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1 inline-block">
                        v{selectedAgent.version}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDetails(false)}
                  className="text-muted-foreground"
                >
                  ✕
                </Button>
              </div>

              {/* System Prompt */}
              <div>
                <h3 className="font-medium mb-2">System Prompt</h3>
                <div className="p-3 bg-muted/20 rounded-lg text-sm">
                  {selectedAgent.systemPrompt}
                </div>
              </div>

              {/* MCP Servers */}
              {selectedAgent.selectedMCPs &&
                selectedAgent.selectedMCPs.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Required MCP Servers</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedAgent.selectedMCPs.map((mcp, index) => (
                        <Badge key={index} variant="outline">
                          <Server className="h-3 w-3 mr-1" />
                          {mcp}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              {/* Keywords */}
              {selectedAgent.keywords && selectedAgent.keywords.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">Keywords</h3>
                  <div className="flex flex-wrap gap-1">
                    {selectedAgent.keywords.map((keyword, index) => (
                      <span
                        key={index}
                        className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Author */}
              {selectedAgent.author && (
                <div>
                  <h3 className="font-medium mb-2">Author</h3>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedAgent.author.name}</span>
                    {selectedAgent.author.url && (
                      <a
                        href={selectedAgent.author.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowDetails(false)}>
                  Close
                </Button>
                {installedAgents.has(selectedAgent.name) ? (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      handleUninstall(selectedAgent);
                      setShowDetails(false);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Uninstall
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      handleInstall(selectedAgent);
                      setShowDetails(false);
                    }}
                    disabled={installing.has(selectedAgent.id)}
                  >
                    {installing.has(selectedAgent.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Install
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
