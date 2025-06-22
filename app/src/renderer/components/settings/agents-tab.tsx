import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/renderer/components/ui/accordion";
import { Button } from "@/renderer/components/ui/button";
import { Checkbox } from "@/renderer/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/renderer/components/ui/dialog";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/renderer/components/ui/tabs";
import { useAgentStore, type Agent } from "@/renderer/libs/stores/agent-store";
import { useMcpStore } from "@/renderer/libs/stores/mcp-store";
import { MCPServerConfig, ToolDefinition } from "@/shared/types/mcp";
import { Bot, Loader2, Server, Settings, Trash2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

interface AgentsTabProps {
  onNavigateToMcp?: () => void;
}

export function AgentsTab({ onNavigateToMcp }: AgentsTabProps) {
  const [mcpServerTools, setMcpServerTools] = useState<
    Record<string, ToolDefinition[]>
  >({});
  const [loadingMcpTools, setLoadingMcpTools] = useState<
    Record<string, boolean>
  >({});
  const [selectedToolNames, setSelectedToolNames] = useState<{
    [mcpId: string]: string[];
  }>({});
  const [newAgent, setNewAgent] = useState({
    name: "",
    description: "",
    systemPrompt: "",
  });
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editSelectedTools, setEditSelectedTools] = useState<{
    [mcpId: string]: string[];
  }>({});
  const [activeTab, setActiveTab] = useState("manage");

  // Get agent store methods and state
  const { availableAgents, fetchAgents, createAgent, saveAgent, deleteAgent } =
    useAgentStore();

  // Get MCP store methods and state
  const {
    mcpServerConfigs,
    loadingMcpConfigs,
    fetchMcpConfigurations,
    getMcpServerTools,
    handleMcpConfigChange,
  } = useMcpStore();

  // Load agents and MCP configs
  useEffect(() => {
    fetchAgents();
    fetchMcpConfigurations();
    // Fetch all MCP server tools immediately
    initializeMcpTools();
  }, [fetchAgents, fetchMcpConfigurations]);

  // Watch for MCP config changes and ensure tools are loaded
  useEffect(() => {
    if (mcpServerConfigs?.mcpServers) {
      Object.keys(mcpServerConfigs.mcpServers).forEach((id) => {
        // If we don't have tools for this server yet, fetch them
        if (!mcpServerTools[id] && !loadingMcpTools[id]) {
          fetchMcpServerTools(id);
        }
      });
    }
  }, [mcpServerConfigs]);

  const initializeMcpTools = async () => {
    // Wait a bit for configs to load, then fetch all tools
    setTimeout(async () => {
      const configs = useMcpStore.getState().mcpServerConfigs;
      if (configs?.mcpServers) {
        console.log(
          "Initializing tools for all MCP servers:",
          Object.keys(configs.mcpServers),
        );
        // Fetch tools for all servers regardless of enabled status
        Object.keys(configs.mcpServers).forEach((id) => {
          fetchMcpServerTools(id);
        });
      }
    }, 500);
  };

  // Reset editing state when dialog closes
  useEffect(() => {
    if (!isEditDialogOpen) {
      setEditingAgent(null);
      setEditSelectedTools({});
    }
  }, [isEditDialogOpen]);

  // Initialize edit tools when editing agent changes
  useEffect(() => {
    if (editingAgent) {
      // Initialize with all available tools, then remove disabled ones
      const toolsByMcp: { [mcpId: string]: string[] } = {};

      // Start with all MCP server tools (not filtering by enabled status)
      if (mcpServerConfigs?.mcpServers) {
        Object.keys(mcpServerConfigs.mcpServers).forEach((mcpId) => {
          const mcpTools = mcpServerTools[mcpId] || [];
          if (mcpTools.length > 0) {
            // Add all tools, then filter out disabled ones
            toolsByMcp[mcpId] = mcpTools
              .filter(
                (tool) =>
                  !editingAgent.disableToolReferences?.some(
                    (disabled) =>
                      disabled.mcpName === mcpId &&
                      disabled.toolName === tool.name,
                  ),
              )
              .map((tool) => tool.name);
          }
        });
      }

      setEditSelectedTools(toolsByMcp);
    }
  }, [editingAgent, mcpServerConfigs, mcpServerTools]);

  // Reset tool selections when switching to create tab
  useEffect(() => {
    if (activeTab === "create") {
      setSelectedToolNames({});
    }
  }, [activeTab]);

  const fetchMcpServerTools = async (id: string) => {
    setLoadingMcpTools((prev) => ({ ...prev, [id]: true }));
    try {
      const tools = await getMcpServerTools(id);
      setMcpServerTools((prev) => ({ ...prev, [id]: tools }));

      // Auto-select all tools for this MCP when they're first loaded
      // All tools are enabled by default since MCP servers are always available
      if (tools.length > 0) {
        const toolNames = tools.map((tool: ToolDefinition) => tool.name);
        const setter = isEditDialogOpen
          ? setEditSelectedTools
          : setSelectedToolNames;
        setter((prev) => ({ ...prev, [id]: toolNames }));
        console.log(
          `Auto-selected ${toolNames.length} tools for MCP server: ${id}`,
        );
      }
    } catch (err) {
      console.error(`Error fetching tools for MCP ${id}:`, err);
      // Keep silent here, no toast to avoid overwhelming the user
    } finally {
      setLoadingMcpTools((prev) => ({ ...prev, [id]: false }));
    }
  };

  const updateMcpConfig = async (
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
    try {
      await handleMcpConfigChange(id, field, value);
      // No need to start/stop servers or fetch tools based on enabled status
      // All tools are always available
    } catch (error) {
      console.error(`Error updating MCP config ${id}:`, error);
      toast.error("Failed to update MCP configuration");
    }
  };

  // Helper function to build disable tool references from unselected tools
  const buildDisableToolReferences = (selectedTools: {
    [mcpId: string]: string[];
  }) => {
    const disableToolReferences: Array<{
      mcpName: string;
      toolName: string;
      reason?: string;
    }> = [];

    if (mcpServerConfigs?.mcpServers) {
      // Check all MCP servers, not just enabled ones
      Object.keys(mcpServerConfigs.mcpServers).forEach((mcpId) => {
        const mcpTools = mcpServerTools[mcpId] || [];
        const selectedToolsForMcp = selectedTools[mcpId] || [];

        mcpTools.forEach((tool) => {
          if (!selectedToolsForMcp.includes(tool.name)) {
            disableToolReferences.push({
              mcpName: mcpId,
              toolName: tool.name,
              reason: "Manually disabled",
            });
          }
        });
      });
    }

    return disableToolReferences;
  };

  const handleSaveAgent = async () => {
    if (!newAgent.name) {
      toast.error("Please provide a name for the agent");
      return;
    }

    const agentData = {
      name: newAgent.name,
      description: newAgent.description || newAgent.name,
      systemPrompt: newAgent.systemPrompt || "",
      disableToolReferences: buildDisableToolReferences(selectedToolNames),
    };

    try {
      await createAgent(agentData);
      toast.success("Agent saved successfully");

      // Reset form
      setNewAgent({
        name: "",
        description: "",
        systemPrompt: "",
      });

      // Reset tool selections after agent creation
      setSelectedToolNames({});

      // Switch to the manage tab
      setActiveTab("manage");
    } catch (err) {
      toast.error(
        `Failed to save agent: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  const handleUpdateAgent = async () => {
    if (!editingAgent) return;

    setIsUpdating(true);

    try {
      const updatedAgent: Agent = {
        ...editingAgent,
        disableToolReferences: buildDisableToolReferences(editSelectedTools),
        systemPrompt: editingAgent.systemPrompt || "",
      };

      await saveAgent(updatedAgent);
      toast.success(`Agent "${editingAgent.name}" updated successfully`);

      setIsEditDialogOpen(false);
    } catch (err) {
      toast.error(
        `Failed to update agent: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAgent = async (agentId: string, agentName: string) => {
    // Confirm deletion
    if (
      !window.confirm(
        `Are you sure you want to delete the agent "${agentName}"?`,
      )
    ) {
      return;
    }

    try {
      const success = await deleteAgent(agentId);

      if (success) {
        toast.success(`Agent "${agentName}" deleted successfully`);
      } else {
        throw new Error("Failed to delete agent");
      }
    } catch (err) {
      toast.error(
        `Failed to delete agent: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  const handleMcpToggle = (id: string, enabled: boolean) => {
    updateMcpConfig(id, "enabled", enabled);
    // Note: enabled/disabled status doesn't affect tool availability
    // Tools are always available, enabled/disabled is just a configuration flag
  };

  // Generic tool selection handler
  const handleToolSelection = (
    mcpId: string,
    toolName: string,
    selected: boolean,
    isEditMode: boolean = false,
  ) => {
    const setterFunction = isEditMode
      ? setEditSelectedTools
      : setSelectedToolNames;

    setterFunction((prev) => {
      const updatedSelection = { ...prev };

      if (!updatedSelection[mcpId]) {
        updatedSelection[mcpId] = [];
      }

      if (selected) {
        updatedSelection[mcpId] = [...updatedSelection[mcpId], toolName];
      } else {
        updatedSelection[mcpId] = updatedSelection[mcpId].filter(
          (t) => t !== toolName,
        );
      }

      return updatedSelection;
    });
  };

  const handleEditAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setIsEditDialogOpen(true);
  };

  const renderMcpTools = (
    isEdit: boolean,
    selectedTools: { [mcpId: string]: string[] },
    onToolSelection: (
      mcpId: string,
      toolName: string,
      selected: boolean,
    ) => void,
  ) => {
    if (loadingMcpConfigs) {
      return (
        <div className="flex justify-center py-4">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      );
    }

    if (
      !mcpServerConfigs?.mcpServers ||
      Object.keys(mcpServerConfigs.mcpServers).length === 0
    ) {
      return (
        <p className="text-muted-foreground">No MCP servers configured.</p>
      );
    }

    return (
      <div className="border-border bg-card rounded-md border">
        <div className="border-border flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Tools - MCP</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1 text-xs"
            onClick={onNavigateToMcp}
          >
            <span className="text-xs">+</span>
            Go to MCP page and add MCP servers
          </Button>
        </div>

        {Object.entries(mcpServerConfigs.mcpServers).map(([id, config]) => {
          const serverConfig = config as MCPServerConfig;
          return (
            <div key={id} className="border-border border-b last:border-0">
              <div className="flex items-center px-4 py-2">
                <div className="flex flex-grow items-center">
                  <Accordion
                    type="single"
                    collapsible
                    className="w-full"
                    defaultValue={id}
                  >
                    <AccordionItem value={id} className="border-0">
                      <div className="flex items-center gap-2">
                        <div className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                          <Checkbox
                            id={`mcp-checkbox-${isEdit ? "edit-" : ""}${id}`}
                            checked={serverConfig.enabled}
                            onCheckedChange={(checked) =>
                              handleMcpToggle(id, checked === true)
                            }
                          />
                        </div>
                        <span
                          className="cursor-pointer text-sm font-medium"
                          onClick={() =>
                            handleMcpToggle(id, !serverConfig.enabled)
                          }
                        >
                          {serverConfig.name || id}
                        </span>

                        <AccordionTrigger
                          className="px-0 py-0 hover:no-underline"
                          style={{ transform: "scaleY(-1)" }}
                        >
                          <span className="sr-only">Toggle details</span>
                        </AccordionTrigger>

                        {serverConfig.description && (
                          <span className="text-muted-foreground mr-2 ml-auto max-w-[40%] truncate text-xs">
                            {serverConfig.description}
                          </span>
                        )}
                      </div>

                      <AccordionContent className="pt-2 pb-2 pl-6">
                        {loadingMcpTools[id] ? (
                          <div className="flex items-center py-1">
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            <span className="text-xs">Loading tools...</span>
                          </div>
                        ) : !mcpServerTools[id] ||
                          mcpServerTools[id].length === 0 ? (
                          <div className="flex items-center justify-between py-1">
                            <p className="text-muted-foreground text-xs">
                              No tools available
                            </p>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => fetchMcpServerTools(id)}
                            >
                              Refresh
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2 py-1">
                            {mcpServerTools[id].map((tool) => (
                              <div
                                key={tool.name}
                                className="hover:bg-secondary/10 flex flex-col rounded px-1 py-2"
                              >
                                <div className="flex w-full items-center">
                                  <div className="mr-2 inline-flex h-4 w-4 shrink-0 items-center justify-center">
                                    <Checkbox
                                      id={`tool-${isEdit ? "edit-" : ""}${id}-${tool.name}`}
                                      checked={
                                        selectedTools[id]?.includes(
                                          tool.name,
                                        ) || false
                                      }
                                      onCheckedChange={(checked) =>
                                        onToolSelection(
                                          id,
                                          tool.name,
                                          checked === true,
                                        )
                                      }
                                    />
                                  </div>
                                  <span className="text-sm font-medium">
                                    {tool.name}
                                  </span>
                                </div>
                                <div
                                  className="mt-1 w-full pl-6"
                                  style={{
                                    opacity: 1,
                                    visibility: "visible",
                                  }}
                                >
                                  <span
                                    className={`text-muted-foreground text-xs`}
                                    style={{
                                      padding: "2px 4px",
                                      color: "var(--muted-foreground)",
                                      whiteSpace: "normal",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      maxHeight: "3rem",
                                      lineHeight: "1.2",
                                      WebkitLineClamp: 2,
                                      display: "-webkit-box",
                                      WebkitBoxOrient: "vertical",
                                      background: "transparent",
                                      borderRadius: "4px",
                                    }}
                                  >
                                    {typeof tool.description === "string" &&
                                    tool.description.trim() !== ""
                                      ? tool.description
                                      : "No description"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-medium text-foreground">Agents</h2>
        <p className="text-muted-foreground mt-1">
          Create and manage agents with MCP tools
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="manage">Manage Agents</TabsTrigger>
          <TabsTrigger value="create">Create Agent</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Name</Label>
              <div className="relative">
                <Input
                  id="agent-name"
                  value={newAgent.name}
                  onChange={(e) =>
                    setNewAgent({ ...newAgent, name: e.target.value })
                  }
                  placeholder="Enter agent name"
                  maxLength={20}
                  className="pr-12"
                />
                <span className="text-muted-foreground absolute top-2.5 right-3 text-xs">
                  {newAgent.name.length}/20
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-description">Description</Label>
              <div className="relative">
                <Input
                  id="agent-description"
                  value={newAgent.description}
                  onChange={(e) =>
                    setNewAgent({ ...newAgent, description: e.target.value })
                  }
                  placeholder="Enter agent description"
                  maxLength={50}
                  className="pr-12"
                />
                <span className="text-muted-foreground absolute top-2.5 right-3 text-xs">
                  {newAgent.description.length}/50
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-prompt">Prompt</Label>
              <div className="relative">
                <textarea
                  id="agent-prompt"
                  className="border-border bg-background min-h-[80px] w-full rounded-md border p-3 text-sm"
                  value={newAgent.systemPrompt}
                  onChange={(e) =>
                    setNewAgent({ ...newAgent, systemPrompt: e.target.value })
                  }
                  placeholder="Enter the agent\'s role, tone, workflow, tool preferences, and any rules or guidelines. (Optional)"
                />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="mb-4 text-lg font-medium">MCP Servers & Tools</h3>
            {renderMcpTools(
              false,
              selectedToolNames,
              (mcpId, toolName, selected) =>
                handleToolSelection(mcpId, toolName, selected, false),
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleSaveAgent}
              disabled={!newAgent.name}
              variant="default"
              className="px-4"
            >
              Create Agent
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="manage">
          {availableAgents.length === 0 ? (
            <p className="text-muted-foreground">No agents created yet.</p>
          ) : (
            <div className="space-y-4">
              {availableAgents.map((agent) => {
                // Get MCP servers with enabled tools based on disableToolReferences
                const serversWithEnabledTools = new Set<string>();

                // Get all configured MCP servers
                if (mcpServerConfigs?.mcpServers) {
                  Object.keys(mcpServerConfigs.mcpServers).forEach((mcpId) => {
                    const mcpTools = mcpServerTools[mcpId] || [];
                    if (mcpTools.length > 0) {
                      // Check if this MCP has any tools that are NOT disabled
                      const hasEnabledTools = mcpTools.some(
                        (tool) =>
                          !agent.disableToolReferences?.some(
                            (disabled) =>
                              disabled.mcpName === mcpId &&
                              disabled.toolName === tool.name,
                          ),
                      );

                      if (hasEnabledTools) {
                        serversWithEnabledTools.add(mcpId);
                      }
                    }
                  });
                }

                // Convert the Set to Array
                const mcpServersList = Array.from(serversWithEnabledTools);

                return (
                  <div
                    key={agent.id}
                    className="bg-card hover:bg-card/90 flex items-start justify-between rounded-lg p-4 transition-colors shadow-xs border border-border/30"
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-primary bg-primary/10 rounded-full p-1.5">
                        <Bot size={18} />
                      </div>
                      <div>
                        <h4 className="font-medium leading-tight">
                          {agent.name}
                        </h4>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {agent.description}
                        </p>

                        {mcpServersList.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {mcpServersList.map((serverName) => (
                              <div
                                key={serverName}
                                className="bg-primary/80 text-primary-foreground/80 flex items-center rounded-full px-2 py-0.5 text-xs"
                              >
                                <Server size={10} className="mr-1" />
                                {serverName}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-full"
                        onClick={() => handleEditAgent(agent)}
                      >
                        <Settings size={14} />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive/90 hover:bg-destructive/10 h-8 w-8 p-0 rounded-full"
                        onClick={() => handleDeleteAgent(agent.id, agent.name)}
                      >
                        <Trash2 size={14} />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto px-6 sm:max-w-[500px]">
          <DialogHeader className="pb-4">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-medium">
                Edit Agent
              </DialogTitle>
            </div>
          </DialogHeader>

          {editingAgent && (
            <div className="space-y-6 py-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-agent-name">Name</Label>
                  <div className="relative">
                    <Input
                      id="edit-agent-name"
                      value={editingAgent.name}
                      onChange={(e) =>
                        setEditingAgent({
                          ...editingAgent,
                          name: e.target.value,
                        })
                      }
                      placeholder="Enter agent name"
                      maxLength={20}
                      className="pr-12"
                    />
                    <span className="text-muted-foreground absolute top-2.5 right-3 text-xs">
                      {editingAgent.name.length}/20
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-agent-description">Description</Label>
                  <div className="relative">
                    <Input
                      id="edit-agent-description"
                      value={editingAgent.description}
                      onChange={(e) =>
                        setEditingAgent({
                          ...editingAgent,
                          description: e.target.value,
                        })
                      }
                      placeholder="Enter agent description"
                      maxLength={50}
                      className="pr-12"
                    />
                    <span className="text-muted-foreground absolute top-2.5 right-3 text-xs">
                      {editingAgent.description.length}/50
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-agent-prompt">Prompt</Label>
                  <div className="relative">
                    <textarea
                      id="edit-agent-prompt"
                      className="border-border bg-background min-h-[120px] w-full rounded-md border p-3 text-sm"
                      value={editingAgent.systemPrompt || ""}
                      onChange={(e) =>
                        setEditingAgent({
                          ...editingAgent,
                          systemPrompt: e.target.value,
                        })
                      }
                      placeholder="Enter the agent\'s role, tone, workflow, tool preferences, and any rules or guidelines. (Optional)"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="mb-4 text-lg font-medium">
                  MCP Servers & Tools
                </h3>
                {renderMcpTools(
                  true,
                  editSelectedTools,
                  (mcpId, toolName, selected) =>
                    handleToolSelection(mcpId, toolName, selected, true),
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mt-6 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateAgent}
              disabled={isUpdating || !editingAgent?.name}
            >
              {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
