import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MCPServerConfig, ToolDefinition } from "@/server/mcp/types";

// Define agent type
interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt?: string;
  toolNames?: string[];
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
    systemPrompt: "",
  });

  // Load agents and MCP configs
  useEffect(() => {
    fetchAgents();
    fetchMcpConfigs();
  }, []);

  const fetchAgents = async () => {
    setLoadingAgents(true);
    try {
      const res = await fetch("http://localhost:38000/api/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = await res.json();
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
      if (!res.ok)
        throw new Error(`Failed to fetch tools for MCP server ${id}`);
      const data = await res.json();
      const tools = data.tools || [];

      // 输出完整的工具数据结构
      console.log(
        `Complete tools data for MCP ${id}:`,
        JSON.stringify(tools, null, 2),
      );

      // 深入检查每个工具对象的结构
      tools.forEach((tool: any, index: number) => {
        console.log(`Tool ${index}: ${tool.name}`, tool);
        if (tool.parameters && tool.parameters.properties) {
          Object.keys(tool.parameters.properties).forEach((propKey) => {
            console.log(
              `- Property ${propKey}:`,
              tool.parameters.properties[propKey],
            );
          });
        }
      });

      // 检查工具数据结构并确保description字段正确处理
      const processedTools = tools.map((tool: any) => {
        // 检查description的位置和类型
        let description = null;

        // 直接检查顶层description
        if (tool.description && typeof tool.description === "string") {
          description = tool.description;
        } else {
          // 从json字符串格式中提取描述
          try {
            // 尝试提取工具描述的几种可能情况
            if (typeof tool === "object") {
              // 常见的描述字段位置
              if (tool.parameters?.description) {
                description = tool.parameters.description;
              } else if (
                tool.parameters?.properties?.description?.description
              ) {
                description =
                  tool.parameters.properties.description.description;
              } else {
                // 遍历所有属性寻找描述
                Object.entries(tool).forEach(([key, value]) => {
                  if (
                    !description &&
                    key.toLowerCase().includes("desc") &&
                    typeof value === "string"
                  ) {
                    description = value;
                  }
                });

                // 检查parameters中的每个属性
                if (!description && tool.parameters?.properties) {
                  Object.values(tool.parameters.properties).forEach(
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

        // 记录找到的描述
        console.log(`Final description for ${tool.name}:`, description);

        // 构造处理后的工具对象，确保包含描述
        const processedTool = {
          ...tool,
          description: description || "No description available",
        };

        return processedTool;
      });

      console.log(`Processed tools for MCP ${id}:`, processedTools);
      setMcpServerTools((prev) => ({ ...prev, [id]: processedTools }));

      // 自动选择所有工具
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
    let hasTools = false;
    const allSelectedTools: string[] = [];
    Object.entries(selectedToolNames).forEach(([mcpId, toolNames]) => {
      if (toolNames.length > 0) {
        hasTools = true;
        toolNames.forEach((tool) => {
          allSelectedTools.push(`${mcpId}:${tool}`);
        });
      }
    });

    if (!hasTools) {
      toast.error("Please select at least one tool");
      return;
    }

    const agentData = {
      id: Date.now().toString(),
      name: newAgent.name,
      description: newAgent.name, // Use name as description
      systemPrompt: newAgent.systemPrompt,
      toolNames: allSelectedTools,
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
        systemPrompt: "",
      });
      setSelectedToolNames({});

      // Refresh agents list
      fetchAgents();
    } catch (err) {
      console.error("Save agent error", err);
      toast.error(
        `Failed to save agent: ${err instanceof Error ? err.message : "Unknown error"}`,
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
                  <button
                    className="text-muted-foreground hover:text-foreground absolute right-2 bottom-2"
                    title="Expand"
                    onClick={() => {
                      /* Expand functionality */
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M15 3h6v6"></path>
                      <path d="M10 14L21 3"></path>
                      <path d="M19 10v11H3V5h11"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="mb-4 text-lg font-medium">MCP Servers & Tools</h3>

              {loadingMcpConfigs ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                </div>
              ) : Object.keys(mcpServerConfigs).length === 0 ? (
                <p className="text-muted-foreground">
                  No MCP servers configured.
                </p>
              ) : (
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
                    <div
                      key={id}
                      className="border-border border-b last:border-0"
                    >
                      <div className="flex items-center px-4 py-2">
                        <div className="flex flex-grow items-center">
                          <Accordion
                            type="single"
                            collapsible
                            className="w-full"
                          >
                            <AccordionItem value={id} className="border-0">
                              <div className="flex items-center gap-2">
                                <div className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                                  <input
                                    type="checkbox"
                                    id={`mcp-checkbox-${id}`}
                                    className="border-border bg-background text-primary h-4 w-4 rounded"
                                    checked={config.enabled}
                                    onChange={(e) =>
                                      handleMcpToggle(id, e.target.checked)
                                    }
                                  />
                                </div>
                                <span
                                  className="cursor-pointer text-sm font-medium"
                                  onClick={() =>
                                    handleMcpToggle(id, !config.enabled)
                                  }
                                >
                                  {config.name || id}
                                </span>
                                <AccordionTrigger className="ml-auto px-0 py-0 hover:no-underline">
                                  <span className="sr-only">
                                    Toggle details
                                  </span>
                                </AccordionTrigger>
                              </div>

                              <AccordionContent className="pt-2 pb-2 pl-6">
                                {config.description && (
                                  <p className="text-muted-foreground mb-3 pl-0 text-xs">
                                    {config.description}
                                  </p>
                                )}

                                {!config.enabled ? (
                                  <p className="text-muted-foreground pl-0 text-xs">
                                    Enable this MCP server to access its tools
                                  </p>
                                ) : loadingMcpTools[id] ? (
                                  <div className="flex items-center py-1">
                                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                    <span className="text-xs">
                                      Loading tools...
                                    </span>
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
                                    {(() => {
                                      console.log(
                                        `MCP Server ID: ${id}, isVSCode:`,
                                        id.toLowerCase().includes("vscode"),
                                      );
                                      return mcpServerTools[id].map((tool) => {
                                        console.log(
                                          `Rendering tool ${tool.name} with description:`,
                                          tool.description,
                                        );
                                        return (
                                          <div
                                            key={tool.name}
                                            className="hover:bg-secondary/10 flex items-center justify-between rounded px-1 py-2"
                                          >
                                            <div className="flex flex-1 items-center">
                                              <div className="mr-2 inline-flex h-4 w-4 shrink-0 items-center justify-center">
                                                <input
                                                  type="checkbox"
                                                  id={`tool-${id}-${tool.name}`}
                                                  className="border-border bg-background text-primary h-4 w-4 rounded"
                                                  checked={
                                                    selectedToolNames[
                                                      id
                                                    ]?.includes(tool.name) ||
                                                    false
                                                  }
                                                  onChange={(e) =>
                                                    handleToolSelection(
                                                      id,
                                                      tool.name,
                                                      e.target.checked,
                                                    )
                                                  }
                                                />
                                              </div>
                                              <span className="text-sm font-medium">
                                                {tool.name}
                                              </span>
                                            </div>
                                            <div
                                              className="ml-4 max-w-[60%] flex-1"
                                              style={{
                                                opacity: 1,
                                                visibility: "visible",
                                              }}
                                            >
                                              <span
                                                className={`text-muted-foreground text-xs`}
                                                style={{
                                                  display: "block",
                                                  padding: "2px 4px",
                                                  color: id
                                                    .toLowerCase()
                                                    .includes("vscode")
                                                    ? "rgba(180,180,180,0.9)"
                                                    : "var(--muted-foreground)",
                                                  textAlign: "right",
                                                  whiteSpace: "nowrap",
                                                  overflow: "hidden",
                                                  textOverflow: "ellipsis",
                                                  background: id
                                                    .toLowerCase()
                                                    .includes("vscode")
                                                    ? "rgba(255,255,255,0.05)"
                                                    : "transparent",
                                                }}
                                              >
                                                {typeof tool.description ===
                                                  "string" &&
                                                tool.description.trim() !== ""
                                                  ? tool.description
                                                  : "No description"}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      });
                                    })()}
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
              )}
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
                {agents.map((agent) => (
                  <div key={agent.id} className="rounded-md border p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium">{agent.name}</h4>
                        <p className="text-muted-foreground text-sm">
                          {agent.description}
                        </p>
                      </div>
                      <Button variant="secondary" size="sm" className="h-8">
                        Edit
                      </Button>
                    </div>

                    <div className="mt-4">
                      <h5 className="mb-2 text-sm font-medium">Tools</h5>
                      <div className="text-muted-foreground text-xs">
                        {agent.toolNames && agent.toolNames.length > 0
                          ? agent.toolNames.join(", ")
                          : "No tools configured"}
                      </div>
                    </div>
                  </div>
                ))}
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
    </Card>
  );
}
