import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/renderer/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/renderer/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/renderer/components/ui/accordion";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/renderer/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/renderer/components/ui/dialog";
import { MCPServerConfig, ToolDefinition } from "@/server/mcp/types";
import { ToolReference } from "@/server/agents/types";
import { v4 as uuidv4 } from "uuid";

// Define agent type
interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt?: string;
  toolNames?: string[];
  toolReferences?: ToolReference[];
}

export function AgentsTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [mcpServerConfigs, setMcpServerConfigs] = useState<
    Record<string, MCPServerConfig>
  >({});
  const [mcpServerTools, setMcpServerTools] = useState<
    Record<string, ToolDefinition[]>
  >({});
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingMcpConfigs, setLoadingMcpConfigs] = useState(false);
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

  // Load agents and MCP configs
  useEffect(() => {
    fetchAgents();
    fetchMcpConfigs();
  }, []);

  // Reset editing state when dialog closes
  useEffect(() => {
    if (!isEditDialogOpen) {
      setEditingAgent(null);
      setEditSelectedTools({});
    }
  }, [isEditDialogOpen]);

  // Initialize edit tools when editing agent changes
  useEffect(() => {
    if (editingAgent && editingAgent.toolReferences) {
      // Group tools by MCP name
      const toolsByMcp: { [mcpId: string]: string[] } = {};

      editingAgent.toolReferences.forEach((ref) => {
        if (!toolsByMcp[ref.mcpName]) {
          toolsByMcp[ref.mcpName] = [];
        }
        toolsByMcp[ref.mcpName].push(ref.toolName);
      });

      setEditSelectedTools(toolsByMcp);
    }
  }, [editingAgent]);

  const fetchAgents = async () => {
    setLoadingAgents(true);
    try {
      const res = await fetch("http://localhost:38000/api/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = await res.json();
      console.log("Fetched agents data:", data.agents);
      setAgents(data.agents || []);
    } catch (err) {
      console.error("Error fetching agents:", err);
      toast.error("Failed to load agents");
    } finally {
      setLoadingAgents(false);
    }
  };

  const fetchMcpConfigs = async () => {
    setLoadingMcpConfigs(true);
    try {
      const res = await fetch("http://localhost:38000/api/mcp/configurations");
      if (!res.ok) throw new Error("Failed to fetch MCP configurations");
      const data = await res.json();

      const configs = (data.configurations || {}) as Record<
        string,
        MCPServerConfig
      >;
      setMcpServerConfigs(configs);

      // Fetch tools for enabled MCP servers
      Object.entries(configs)
        .filter(([, config]) => config.enabled)
        .forEach(([id]) => {
          fetchMcpServerTools(id);
        });
    } catch (err) {
      console.error("Error fetching MCP configs:", err);
      toast.error("Failed to load MCP configurations");
    } finally {
      setLoadingMcpConfigs(false);
    }
  };

  const fetchMcpServerTools = async (id: string) => {
    setLoadingMcpTools((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(
        `http://localhost:38000/api/mcp/servers/${id}/tools`,
      );
      console.log("Fetching tools for MCP server:", id);
      if (!res.ok)
        throw new Error(`Failed to fetch tools for MCP server ${id}`);
      const data = await res.json();
      const tools = data.tools || [];

      const processedTools = tools.map((tool: ToolDefinition) => {
        let description: string | undefined;

        if (tool.description && typeof tool.description === "string") {
          description = tool.description;
        } else {
          try {
            if (typeof tool === "object") {
              if (tool.parameters?.description) {
                description = tool.parameters.description;
              } else if (
                tool.parameters?.properties?.description?.description
              ) {
                description =
                  tool.parameters.properties.description.description;
              } else {
                Object.entries(tool).forEach(([key, value]) => {
                  if (
                    !description &&
                    key.toLowerCase().includes("desc") &&
                    typeof value === "string"
                  ) {
                    description = value;
                  }
                });

                if (!description && tool.parameters?.properties) {
                  Object.values(tool.parameters.properties).forEach(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (prop: any) => {
                      if (
                        !description &&
                        prop.description &&
                        typeof prop.description === "string"
                      ) {
                        description = prop.description;
                      }
                    },
                  );
                }
              }
            }
          } catch (e) {
            console.error(
              `Error parsing description for tool ${tool.name}:`,
              e,
            );
          }
        }

        console.log(`Final description for ${tool.name}:`, description);

        const processedTool = {
          ...tool,
          description: description || "No description available",
        };

        return processedTool;
      });

      console.log(`Processed tools for MCP ${id}:`, processedTools);
      setMcpServerTools((prev) => ({ ...prev, [id]: processedTools }));

      if (processedTools.length > 0) {
        setSelectedToolNames((prev) => ({
          ...prev,
          [id]: processedTools.map((tool: ToolDefinition) => tool.name),
        }));
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
      const updatedConfig = {
        ...mcpServerConfigs[id],
        [field]: value,
      };

      setMcpServerConfigs((prev) => ({
        ...prev,
        [id]: updatedConfig,
      }));

      // If we're enabling a server, fetch its tools
      if (field === "enabled" && value === true) {
        fetchMcpServerTools(id);
      }

      // Save to server
      const res = await fetch(
        `http://localhost:38000/api/mcp/configurations/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedConfig),
        },
      );

      if (!res.ok) {
        throw new Error("Failed to update MCP configuration");
      }
    } catch (err) {
      console.error("Error updating MCP config:", err);
      toast.error("Failed to update MCP configuration");

      // Revert the change
      fetchMcpConfigs();
    }
  };

  const handleSaveAgent = async () => {
    if (!newAgent.name) {
      toast.error("Please provide a name for the agent");
      return;
    }

    // Combine all selected tools from all MCPs
    const allToolReferences: ToolReference[] = [];
    // For backward compatibility
    const allSelectedTools: string[] = [];

    Object.entries(selectedToolNames).forEach(([mcpId, toolNames]) => {
      if (toolNames.length > 0) {
        toolNames.forEach((tool) => {
          // Add standardized tool reference
          allToolReferences.push({
            mcpName: mcpId,
            toolName: tool,
            isBuiltIn: mcpId === "Dev-MCP" || mcpId === "codefox-mcp",
          });

          // Keep the old format for backward compatibility
          allSelectedTools.push(`${mcpId}:${tool}`);
        });
      }
    });

    console.log("Saving agent with tools:", allSelectedTools);
    console.log("Saving agent with toolReferences:", allToolReferences);

    const agentData = {
      id: uuidv4(),
      name: newAgent.name,
      description: newAgent.description || newAgent.name, // Use description or fall back to name
      systemPrompt: newAgent.systemPrompt || "", // Ensure systemPrompt is always a string
      toolNames: allSelectedTools,
      toolReferences: allToolReferences,
    };

    try {
      const res = await fetch("http://localhost:38000/api/agents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to save agent");
      }

      toast.success("Agent saved successfully");

      // Reset form
      setNewAgent({
        name: "",
        description: "",
        systemPrompt: "",
      });
      setSelectedToolNames({});

      // Refresh agents list
      fetchAgents();

      // Dispatch an event to notify other components (like AgentPopover)
      // that the agent list has been updated
      try {
        // For the main window
        window.dispatchEvent(new CustomEvent("agent-list-updated"));

        // For other windows (like the agent popover) - we'll dispatch using a custom event
        // that the preload script will convert to an IPC message
        window.dispatchEvent(new CustomEvent("agent-list-updated-ipc"));

        // Log the event dispatch
        console.log("Dispatched agent-list-updated event");
      } catch (error) {
        console.error("Error dispatching agent list update event:", error);
      }
    } catch (err) {
      console.error("Save agent error", err);
      toast.error(
        `Failed to save agent: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  const handleUpdateAgent = async () => {
    if (!editingAgent) return;

    setIsUpdating(true);

    try {
      const allToolReferences: ToolReference[] = [];
      const allSelectedTools: string[] = [];

      Object.entries(editSelectedTools).forEach(([mcpId, toolNames]) => {
        if (toolNames.length > 0) {
          toolNames.forEach((tool) => {
            allToolReferences.push({
              mcpName: mcpId,
              toolName: tool,
              isBuiltIn: mcpId === "Dev-MCP" || mcpId === "codefox-mcp",
            });

            allSelectedTools.push(`${mcpId}:${tool}`);
          });
        }
      });

      console.log(
        `Updating agent ID ${editingAgent.id} with ${allToolReferences.length} tools`,
      );

      const agentData = {
        id: editingAgent.id,
        name: editingAgent.name,
        description: editingAgent.description,
        systemPrompt: editingAgent.systemPrompt || "",
        toolNames: allSelectedTools,
        toolReferences: allToolReferences,
      };

      const res = await fetch(
        `http://localhost:38000/api/agents/${editingAgent.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(agentData),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.message || "Failed to update agent");
      }

      toast.success(`Agent "${editingAgent.name}" updated successfully`);

      setIsEditDialogOpen(false);
      fetchAgents();

      window.dispatchEvent(new CustomEvent("agent-list-updated"));
      window.dispatchEvent(new CustomEvent("agent-list-updated-ipc"));
    } catch (err) {
      console.error("Update agent error:", err);
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
      const res = await fetch(`http://localhost:38000/api/agents/${agentId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.message || "Failed to delete agent");
      }

      toast.success(`Agent "${agentName}" deleted successfully`);

      // Refresh the agent list
      fetchAgents();

      // Dispatch event to notify other components
      try {
        window.dispatchEvent(new CustomEvent("agent-list-updated"));
        window.dispatchEvent(new CustomEvent("agent-list-updated-ipc"));
        console.log("Dispatched agent-list-updated event after deletion");
      } catch (error) {
        console.error("Error dispatching agent list update event:", error);
      }
    } catch (err) {
      console.error("Delete agent error:", err);
      toast.error(
        `Failed to delete agent: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  const handleMcpToggle = (id: string, enabled: boolean) => {
    updateMcpConfig(id, "enabled", enabled);
  };

  const handleToolSelection = (
    mcpId: string,
    toolName: string,
    selected: boolean,
  ) => {
    setSelectedToolNames((prev) => {
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

  const handleEditToolSelection = (
    mcpId: string,
    toolName: string,
    selected: boolean,
  ) => {
    setEditSelectedTools((prev) => {
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

    if (Object.keys(mcpServerConfigs).length === 0) {
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
            onClick={() => {
              /* TODO: Add navigation to MCP page */
            }}
          >
            <span className="text-xs">+</span>
            Go to MCP page and add MCP servers
          </Button>
        </div>

        {Object.entries(mcpServerConfigs).map(([id, config]) => (
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
                          checked={config.enabled}
                          onCheckedChange={(checked) =>
                            handleMcpToggle(id, checked === true)
                          }
                        />
                      </div>
                      <span
                        className="cursor-pointer text-sm font-medium"
                        onClick={() => handleMcpToggle(id, !config.enabled)}
                      >
                        {config.name || id}
                      </span>

                      <AccordionTrigger
                        className="px-0 py-0 hover:no-underline"
                        style={{ transform: "scaleY(-1)" }}
                      >
                        <span className="sr-only">Toggle details</span>
                      </AccordionTrigger>

                      {config.description && (
                        <span className="text-muted-foreground mr-2 ml-auto max-w-[40%] truncate text-xs">
                          {config.description}
                        </span>
                      )}
                    </div>

                    <AccordionContent className="pt-2 pb-2 pl-6">
                      {!config.enabled ? (
                        <p className="text-muted-foreground pl-0 text-xs">
                          Enable this MCP server to access its tools
                        </p>
                      ) : loadingMcpTools[id] ? (
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
                                      selectedTools[id]?.includes(tool.name) ||
                                      false
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
        ))}
      </div>
    );
  };

  return (
    <Card className="bg-card text-foreground border-none">
      <CardHeader>
        <CardTitle>Agents</CardTitle>
        <CardDescription>
          Create and manage agents with MCP tools
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="create" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="create">Create Agent</TabsTrigger>
            <TabsTrigger value="manage">Manage Agents</TabsTrigger>
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
                    placeholder="Enter the agent's role, tone, workflow, tool preferences, and any rules or guidelines. (Optional)"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="mb-4 text-lg font-medium">MCP Servers & Tools</h3>
              {renderMcpTools(false, selectedToolNames, handleToolSelection)}
            </div>
          </TabsContent>

          <TabsContent value="manage">
            {loadingAgents ? (
              <div className="flex justify-center py-4">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            ) : agents.length === 0 ? (
              <p className="text-muted-foreground">No agents created yet.</p>
            ) : (
              <div className="space-y-4">
                {agents.map((agent) => {
                  console.log(`Agent ${agent.name} tools:`, {
                    toolNames: agent.toolNames,
                    toolReferences: agent.toolReferences,
                  });

                  // Format tools for display - prioritize toolReferences over toolNames if available
                  let formattedTools: string[] = [];

                  if (agent.toolReferences && agent.toolReferences.length > 0) {
                    // Format tool references
                    formattedTools = agent.toolReferences.map(
                      (toolRef) => `${toolRef.toolName} (${toolRef.mcpName})`,
                    );
                  } else if (agent.toolNames && agent.toolNames.length > 0) {
                    // Format tool names (legacy format)
                    formattedTools = agent.toolNames.map((toolId) => {
                      const parts = toolId.split(":");
                      return parts.length > 1
                        ? `${parts[1]} (${parts[0]})`
                        : toolId;
                    });
                  }

                  return (
                    <div key={agent.id} className="rounded-md border p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{agent.name}</h4>
                          <p className="text-muted-foreground text-sm">
                            {agent.description}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => handleEditAgent(agent)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8"
                            onClick={() =>
                              handleDeleteAgent(agent.id, agent.name)
                            }
                          >
                            Delete
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4">
                        <h5 className="mb-2 text-sm font-medium">Tools</h5>
                        <div className="text-muted-foreground text-xs">
                          {formattedTools.length > 0
                            ? formattedTools.join(", ")
                            : "No tools configured"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="flex justify-end">
        <Button
          onClick={handleSaveAgent}
          disabled={!newAgent.name}
          variant="default"
          className="px-4"
        >
          Create Agent
        </Button>
      </CardFooter>

      {/* Edit Agent Dialog */}
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
                      placeholder="Enter the agent's role, tone, workflow, tool preferences, and any rules or guidelines. (Optional)"
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
                  handleEditToolSelection,
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
    </Card>
  );
}
