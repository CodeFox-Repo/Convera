import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import {
  AgentFormData,
  MarketAgent,
  MCPInstallationConfig,
  MCPServerConfig,
} from "@/types/market";
import { Copy, Download, Edit, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { 
  useAgents, 
  useApps, 
  useCreateAgent, 
  useUpdateAgent, 
  useDeleteAgent, 
  useDownloadAgent, 
  useImportAgent 
} from "@/hooks/useRequest";

export function AgentMarketManagement() {
  // React Query hooks
  const { data: agents = [], isLoading: agentsLoading, error: agentsError } = useAgents();
  const { data: availableApps = [], isLoading: appsLoading, refetch: refetchApps } = useApps();
  const createAgentMutation = useCreateAgent();
  const updateAgentMutation = useUpdateAgent();
  const deleteAgentMutation = useDeleteAgent();
  const downloadAgentMutation = useDownloadAgent();
  const importAgentMutation = useImportAgent();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<MarketAgent | null>(null);
  const [formData, setFormData] = useState<AgentFormData>({
    name: "",
    description: "",
    systemPrompt: "",
    predefined: false,
    selectedMCPs: [],
    disableToolsStr: "",
  });

  // MCP Installation configuration state
  const [mcpInstallationConfig, setMcpInstallationConfig] = useState<MCPInstallationConfig>({
    mcpServers: {},
  });

  // JSON editor state
  const [jsonEditorContent, setJsonEditorContent] = useState("");
  const [isJsonValid, setIsJsonValid] = useState(true);

  // Disabled tools management for agent form
  const [disabledToolsList, setDisabledToolsList] = useState<string[]>([]);
  const [disabledToolInput, setDisabledToolInput] = useState("");

  // App search dialog state
  const [appSearchOpen, setAppSearchOpen] = useState(false);
  const [appSearchQuery, setAppSearchQuery] = useState("");


  // Convert MCP installations to the new config format
  const convertToMcpInstallationConfig = (
    mcpInstallations?: Record<string, unknown>,
  ): MCPInstallationConfig => {
    const mcpServers: Record<string, MCPServerConfig> = {};

    if (mcpInstallations) {
      Object.entries(mcpInstallations).forEach(([key, value]) => {
        if (value && typeof value === "object") {
          const mcpValue = value as Record<string, unknown>;
          mcpServers[key] = {
            command: typeof mcpValue.command === "string" ? mcpValue.command : undefined,
            args: Array.isArray(mcpValue.args) ? (mcpValue.args as string[]) : undefined,
            env:
              mcpValue.env && typeof mcpValue.env === "object"
                ? (mcpValue.env as Record<string, string>)
                : undefined,
            url: typeof mcpValue.url === "string" ? mcpValue.url : undefined,
          };
        }
      });
    }

    return { mcpServers };
  };

  // Update JSON editor when MCP config changes
  const updateJsonEditor = useCallback(() => {
    try {
      const jsonString = JSON.stringify(mcpInstallationConfig, null, 2);
      setJsonEditorContent(jsonString);
      setIsJsonValid(true);
    } catch (error) {
      console.error("Failed to stringify MCP config:", error);
      setIsJsonValid(false);
    }
  }, [mcpInstallationConfig]);

  // Parse JSON from editor and update MCP config
  const parseJsonFromEditor = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);

      // Validate structure
      if (parsed && typeof parsed === "object" && parsed.mcpServers) {
        setMcpInstallationConfig(parsed);
        setIsJsonValid(true);

        // Update selected MCPs list
        const mcpNames = Object.keys(parsed.mcpServers);
        setFormData((prev) => ({
          ...prev,
          selectedMCPs: mcpNames,
        }));
      } else {
        setIsJsonValid(false);
      }
    } catch (error) {
      setIsJsonValid(false);
    }
  };

  // Remove MCP from configuration
  const removeMcpFromConfig = (mcpName: string) => {
    setMcpInstallationConfig((prev) => {
      const newMcpServers = { ...prev.mcpServers };
      delete newMcpServers[mcpName];
      return { mcpServers: newMcpServers };
    });

    // Remove from selected MCPs
    setFormData((prev) => ({
      ...prev,
      selectedMCPs: prev.selectedMCPs.filter((name) => name !== mcpName),
    }));
  };

  // Copy MCP configuration to clipboard
  const copyMcpConfig = () => {
    navigator.clipboard.writeText(jsonEditorContent);
    toast({ title: "Success", description: "MCP configuration copied to clipboard" });
  };

  // Add custom MCP with placeholder
  const addCustomMcp = () => {
    // Generate unique name by adding number suffix if needed
    let mcpName = "custom-mcp";
    let counter = 1;
    while (mcpInstallationConfig.mcpServers[mcpName]) {
      mcpName = `custom-mcp-${counter}`;
      counter++;
    }

    const newConfig = {
      command: "placeholder",
      args: ["placeholder"],
      env: {
        PLACEHOLDER: "placeholder",
      },
    };

    setMcpInstallationConfig((prev) => ({
      mcpServers: {
        ...prev.mcpServers,
        [mcpName]: newConfig,
      },
    }));

    // Add to selected MCPs
    setFormData((prev) => ({
      ...prev,
      selectedMCPs: [...prev.selectedMCPs, mcpName],
    }));

    toast({ title: "Success", description: "Custom MCP added to configuration" });
  };

  // Open app search dialog
  const openAppSearch = () => {
    setAppSearchOpen(true);
    refetchApps(); // Manually trigger apps fetch when opening search
  };

  // Add app to MCP configuration
  const addAppToMcp = (app: {
    id: string;
    name: string;
    description: string;
    iconUrl?: string;
    config?: MCPServerConfig;
    version?: string;
    keywords?: string[];
    author?: { name: string; url?: string };
  }) => {
    const mcpName = app.id || app.name;

    // Check if already exists
    if (mcpInstallationConfig.mcpServers[mcpName]) {
      toast({ title: "Warning", description: "This app is already added", variant: "destructive" });
      return;
    }

    // Convert app config to MCP server config
    const mcpConfig = {
      command: app.config?.command || "npx",
      args: app.config?.args || ["-y", `@modelcontextprotocol/server-${app.id}`],
      env: app.config?.env || {},
      url: app.config?.url,
    };

    // Remove undefined values
    Object.keys(mcpConfig).forEach((key) => {
      if (mcpConfig[key] === undefined) {
        delete mcpConfig[key];
      }
    });

    setMcpInstallationConfig((prev) => ({
      mcpServers: {
        ...prev.mcpServers,
        [mcpName]: mcpConfig,
      },
    }));

    // Add to selected MCPs
    setFormData((prev) => ({
      ...prev,
      selectedMCPs: [...prev.selectedMCPs, mcpName],
    }));

    setAppSearchOpen(false);
    toast({ title: "Success", description: `Added ${app.name} to MCP configuration` });
  };

  // Filter apps based on search query
  const filteredApps = availableApps.filter(
    (app: {
      name?: string;
      description?: string;
      keywords?: string[];
    }) =>
      app.name?.toLowerCase().includes(appSearchQuery.toLowerCase()) ||
      app.description?.toLowerCase().includes(appSearchQuery.toLowerCase()) ||
      app.keywords?.some((keyword: string) =>
        keyword.toLowerCase().includes(appSearchQuery.toLowerCase()),
      ),
  );

  // Disabled tools management functions
  const addDisabledTool = () => {
    if (disabledToolInput.trim() && !disabledToolsList.includes(disabledToolInput.trim())) {
      setDisabledToolsList([...disabledToolsList, disabledToolInput.trim()]);
      setDisabledToolInput("");
      setFormData({
        ...formData,
        disableToolsStr: [...disabledToolsList, disabledToolInput.trim()].join(", "),
      });
    }
  };

  const removeDisabledTool = (tool: string) => {
    const newList = disabledToolsList.filter((t) => t !== tool);
    setDisabledToolsList(newList);
    setFormData({
      ...formData,
      disableToolsStr: newList.join(", "),
    });
  };

  const handleDisabledToolInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDisabledTool();
    }
  };


  // Update JSON editor whenever MCP config changes
  useEffect(() => {
    updateJsonEditor();
  }, [mcpInstallationConfig, updateJsonEditor]);

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      systemPrompt: "",
      predefined: false,
      selectedMCPs: [],
      disableToolsStr: "",
    });
    setEditingAgent(null);
    setMcpInstallationConfig({ mcpServers: {} });
    setDisabledToolsList([]);
    setDisabledToolInput("");
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (agent: MarketAgent) => {
    const disabledTools = agent.disableToolReferences || [];
    setFormData({
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      predefined: agent.predefined,
      selectedMCPs: agent.selectedMCPs || [],
      disableToolsStr: disabledTools.join(", "),
    });
    setDisabledToolsList(disabledTools);
    setEditingAgent(agent);

    // Convert existing MCP installations to new format
    const mcpConfig = convertToMcpInstallationConfig(agent.mcpInstallations);
    setMcpInstallationConfig(mcpConfig);

    setDialogOpen(true);
  };

  const saveAgent = async () => {
    // Prepare agentJson
    const agentJson = {
      name: formData.name,
      description: formData.description,
      systemPrompt: formData.systemPrompt,
      predefined: formData.predefined,
      selectedMCPs: formData.selectedMCPs,
      disableToolReferences: formData.disableToolsStr
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Convert MCP config back to installations format
    const mcpInstallations: Record<string, unknown> = {};
    Object.entries(mcpInstallationConfig.mcpServers).forEach(([key, config]) => {
      mcpInstallations[key] = {
        command: config.command,
        args: config.args,
        env: config.env,
        url: config.url,
      };
    });

    const data = {
      agentJson: JSON.stringify(agentJson),
      mcpInstallations: JSON.stringify(mcpInstallations),
    };

    if (editingAgent) {
      updateAgentMutation.mutate(
        { agentId: editingAgent.id, data },
        {
          onSuccess: () => {
            setDialogOpen(false);
            resetForm();
          },
        }
      );
    } else {
      createAgentMutation.mutate(data, {
        onSuccess: () => {
          setDialogOpen(false);
          resetForm();
        },
      });
    }
  };

  const deleteAgent = (agentId: string | number) => {
    deleteAgentMutation.mutate(agentId);
  };

  const downloadAgent = (agentId: string | number) => {
    downloadAgentMutation.mutate(agentId);
  };

  const importJsonFile = (file: File) => {
    importAgentMutation.mutate(file);
  };

  // Show error state if agents failed to load
  if (agentsError) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <X className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading agents</h3>
              <div className="mt-2 text-sm text-red-700">
                Failed to load agents. Please try refreshing the page.
              </div>
            </div>
            <div className="ml-auto pl-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <div className="space-x-2">
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" /> Create Agent
          </Button>
          <Button variant="secondary" asChild>
            <label className="flex cursor-pointer items-center">
              <Upload className="mr-2 h-4 w-4" /> Import JSON
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importJsonFile(file);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>System Prompt</TableHead>
              <TableHead>MCPs</TableHead>
              <TableHead>Predefined</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agentsLoading ? (
              <TableRow>
                <TableCell colSpan={6}>Loading...</TableCell>
              </TableRow>
            ) : agents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>No agents found</TableCell>
              </TableRow>
            ) : (
              agents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>{agent.name}</TableCell>
                  <TableCell>{agent.description}</TableCell>
                  <TableCell className="max-w-xs truncate whitespace-nowrap">
                    {agent.systemPrompt}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(agent.selectedMCPs || []).slice(0, 3).map((mcp: string) => (
                        <Badge key={mcp} variant="secondary" className="text-xs">
                          {mcp}
                        </Badge>
                      ))}
                      {(agent.selectedMCPs || []).length > 3 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-xs">
                                +{(agent.selectedMCPs || []).length - 3}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="space-y-1">
                                {(agent.selectedMCPs || []).slice(3).map((mcp: string) => (
                                  <div key={mcp}>{mcp}</div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={agent.predefined ? "default" : "secondary"}>
                      {agent.predefined ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(agent)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit agent</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadAgent(agent.id)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Download agent</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the agent.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteAgent(agent.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex h-[90vh] max-w-[95vw] flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editingAgent ? "Edit Agent" : "Create New Agent"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 gap-6 overflow-hidden px-2">
            {/* Left Panel - Agent Form */}
            <div className="flex w-2/5 min-w-0 flex-col pr-2">
              <div className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Agent name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Agent description"
                    rows={3}
                    className="min-w-0 resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="systemPrompt">System Prompt</Label>
                  <Textarea
                    id="systemPrompt"
                    value={formData.systemPrompt}
                    onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                    placeholder="System prompt for the agent"
                    rows={5}
                    className="min-w-0 resize-none"
                  />
                </div>

                {/* Selected MCPs Display */}
                <div className="space-y-2">
                  <Label>Selected MCPs</Label>
                  <div className="min-w-0 overflow-hidden rounded border p-3">
                    {Object.keys(mcpInstallationConfig.mcpServers).length === 0 ? (
                      <p className="text-muted-foreground text-sm">No MCPs selected</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {Object.keys(mcpInstallationConfig.mcpServers).map((mcpName) => (
                          <Badge
                            key={mcpName}
                            variant="default"
                            className="flex items-center gap-1 pr-1"
                          >
                            <span>{mcpName}</span>
                            <button
                              type="button"
                              onClick={() => removeMcpFromConfig(mcpName)}
                              className="ml-1 rounded-sm hover:bg-white/20"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Disabled Tools</Label>
                  <div className="min-w-0 space-y-2">
                    {disabledToolsList.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {disabledToolsList.map((tool, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="flex items-center gap-1 pr-1"
                          >
                            <span>{tool}</span>
                            <button
                              type="button"
                              onClick={() => removeDisabledTool(tool)}
                              className="ml-1 rounded-sm hover:bg-gray-300"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex min-w-0 gap-2">
                      <Input
                        value={disabledToolInput}
                        onChange={(e) => setDisabledToolInput(e.target.value)}
                        onKeyDown={handleDisabledToolInputKeyDown}
                        placeholder="Add disabled tool and press Enter"
                        className="min-w-0 flex-1"
                      />
                      <Button type="button" onClick={addDisabledTool} size="sm">
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel - MCP Installation Configuration */}
            <div className="flex w-3/5 flex-col">
              <Card className="flex flex-1 flex-col">
                <CardHeader className="flex-shrink-0 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">MCP Installation Configuration</CardTitle>
                      <CardDescription>
                        JSON configuration for MCP servers that will be installed
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={copyMcpConfig}>
                        <Copy className="mr-2 h-4 w-4" /> Copy
                      </Button>
                      <Button variant="outline" size="sm" onClick={addCustomMcp}>
                        <Plus className="mr-2 h-4 w-4" /> Add
                      </Button>
                      <Button variant="outline" size="sm" onClick={openAppSearch}>
                        <Search className="mr-2 h-4 w-4" /> Search Apps
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col pb-4">
                  <div className="flex flex-1 flex-col space-y-2">
                    <Textarea
                      value={jsonEditorContent}
                      onChange={(e) => {
                        setJsonEditorContent(e.target.value);
                        parseJsonFromEditor(e.target.value);
                      }}
                      placeholder='{\n  "mcpServers": {\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem"],\n      "env": {\n        "DEBUG": "true"\n      }\n    },\n    "custom-mcp": {\n      "command": "placeholder",\n      "args": ["placeholder"],\n      "env": {\n        "PLACEHOLDER": "placeholder"\n      }\n    }\n  }\n}'
                      className={`flex-1 resize-none font-mono text-sm ${!isJsonValid ? "border-red-500" : ""}`}
                    />
                    {!isJsonValid && <p className="text-sm text-red-500">Invalid JSON format</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={saveAgent} 
              disabled={!isJsonValid || createAgentMutation.isPending || updateAgentMutation.isPending}
            >
              {(createAgentMutation.isPending || updateAgentMutation.isPending) ? "Saving..." : (editingAgent ? "Update" : "Create")} Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* App Search Dialog */}
      <Dialog open={appSearchOpen} onOpenChange={setAppSearchOpen}>
        <DialogContent className="flex h-[80vh] max-w-5xl flex-col" style={{ zIndex: 1000 }}>
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Search Available Apps</DialogTitle>
            <DialogDescription>
              Browse and select from available MCP applications to add to your agent configuration.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col space-y-4">
            {/* Search Input */}
            <div className="flex flex-shrink-0 gap-2">
              <Input
                placeholder="Search apps by name, description, or keywords..."
                value={appSearchQuery}
                onChange={(e) => setAppSearchQuery(e.target.value)}
                className="flex-1"
              />
            </div>

            {/* Apps List */}
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
              {appsLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <p>Loading apps...</p>
                </div>
              ) : filteredApps.length === 0 ? (
                <div className="flex h-32 items-center justify-center">
                  <p className="text-muted-foreground">
                    {appSearchQuery ? "No apps match your search" : "No apps available"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {filteredApps.map((app: {
                    id: string;
                    name: string;
                    description: string;
                    iconUrl?: string;
                    version?: string;
                    keywords?: string[];
                    author?: { name: string; url?: string };
                  }) => (
                    <Card key={app.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            {app.iconUrl && (
                              <img src={app.iconUrl} alt={app.name} className="h-8 w-8 rounded" />
                            )}
                            <div>
                              <h3 className="font-semibold">{app.name}</h3>
                              <p className="text-muted-foreground text-sm">{app.description}</p>
                            </div>
                          </div>

                          {app.keywords && app.keywords.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {app.keywords.slice(0, 5).map((keyword: string) => (
                                <Badge key={keyword} variant="secondary" className="text-xs">
                                  {keyword}
                                </Badge>
                              ))}
                              {app.keywords.length > 5 && (
                                <Badge variant="outline" className="text-xs">
                                  +{app.keywords.length - 5} more
                                </Badge>
                              )}
                            </div>
                          )}

                          <div className="text-muted-foreground mt-2 text-xs">
                            Version: {app.version || "1.0.0"}
                            {app.author?.name && ` • By: ${app.author.name}`}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          onClick={() => addAppToMcp(app)}
                          disabled={!!mcpInstallationConfig.mcpServers[app.id || app.name]}
                        >
                          {mcpInstallationConfig.mcpServers[app.id || app.name] ? "Added" : "Add"}
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="bg-background flex-shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setAppSearchOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
