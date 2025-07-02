import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { getBaseURL, useSession } from "@/lib/auth-client";
import { Download, Edit, Info, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

interface MarketAgentApi {
  agentId: number;
  publisherId: string;
  agentJson: {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    predefined: boolean;
    selectedMCPs?: string[];
    disableToolReferences?: string[];
    createdAt: string;
    updatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
  mcpInstallations?: Record<string, MCPInstallation>;
}

interface MCPInstallation {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  apiKey?: string;
  description?: string;
}

interface MarketAgent {
  id: number | string;
  name: string;
  description: string;
  systemPrompt: string;
  predefined: boolean;
  selectedMCPs?: string[];
  disableToolReferences?: string[];
  createdAt: string;
  updatedAt: string;
  mcpInstallations?: Record<string, MCPInstallation>;
}

interface AgentFormData {
  name: string;
  description: string;
  systemPrompt: string;
  predefined: boolean;
  selectedMCPs: string[];
  disableToolsStr: string;
}

interface MCPServerOption {
  serverId: string;
  name?: string;
  description?: string;
}

interface MCPDetailedConfig {
  id: string;
  name: string;
  description: string;
  config: {
    command?: string;
    args?: string[];
    url?: string;
    apiKey?: string;
    description?: string;
    cwd?: string;
    env?: Record<string, string>;
    [key: string]: unknown;
  };
  version?: string;
  keywords?: string[];
  author?: {
    name: string;
    url?: string;
  };
}

type UnknownServer = { serverId?: string; id?: string; name?: string };

export function AgentMarketManagement() {
  const { data: session } = useSession();
  const [agents, setAgents] = useState<MarketAgent[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [initialAgentMcpIds, setInitialAgentMcpIds] = useState<string[]>([]);
  const [mcpOptions, setMcpOptions] = useState<MCPServerOption[]>([]);
  const [mcpDetails, setMcpDetails] = useState<Record<string, MCPDetailedConfig>>({});
  const [loadingMcpDetails, setLoadingMcpDetails] = useState<Set<string>>(new Set());

  const fetchAgents = async () => {
    try {
      const res = await fetch(`${getBaseURL()}/api/agent-market`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data: MarketAgentApi[] = await res.json();
      console.log("agent-market data", data);
      const transformed = data.map((item) => ({
        id: item.agentId,
        name: item.agentJson.name,
        description: item.agentJson.description,
        systemPrompt: item.agentJson.systemPrompt,
        predefined: item.agentJson.predefined,
        selectedMCPs: item.agentJson.selectedMCPs,
        disableToolReferences: item.agentJson.disableToolReferences,
        createdAt: item.agentJson.createdAt ?? item.createdAt,
        updatedAt: item.agentJson.updatedAt ?? item.updatedAt,
        mcpInstallations: item.mcpInstallations,
      }));
      setAgents(transformed);
    } catch (error) {
      toast({ title: "Error", description: "Unable to load agents", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchMcpOptions = async () => {
    try {
      const res = await fetch(`${getBaseURL()}/api/app`, {
        credentials: "include",
      });
      const data = await res.json();

      const serversArr: MCPServerOption[] = [];

      // Helper function to push unique
      const pushServer = (srv: MCPServerOption) => {
        if (!serversArr.some((s) => s.serverId === srv.serverId)) serversArr.push(srv);
      };

      // case 1: array list
      if (Array.isArray(data?.data?.mcpServers)) {
        (data.data.mcpServers as UnknownServer[]).forEach((s) =>
          pushServer({ serverId: s.serverId || s.id || "", name: s.name }),
        );
      }
      // case 2: object map
      else if (data?.mcpServers && typeof data.mcpServers === "object") {
        Object.entries(data.mcpServers as Record<string, { name?: string }>).forEach(([key, val]) =>
          pushServer({ serverId: key, name: val?.name }),
        );
      } else if (Array.isArray(data)) {
        (data as UnknownServer[]).forEach((s) =>
          pushServer({ serverId: s.serverId || s.id || "", name: s.name }),
        );
      }

      console.log("MCP options fetched", serversArr);
      setMcpOptions(serversArr);
    } catch (err) {
      console.log("Failed to fetch MCP options", err);
    }
  };

  // Fetch detailed MCP configuration from the main list
  const fetchMcpDetail = async (serverId: string) => {
    if (mcpDetails[serverId] || loadingMcpDetails.has(serverId)) return;

    setLoadingMcpDetails((prev) => new Set([...prev, serverId]));

    try {
      const res = await fetch(`${getBaseURL()}/api/app`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch MCP list`);
      }

      const data = await res.json();
      console.log(`MCP list data:`, data);

      // Find the specific server from the list
      let foundServer = null;

      // Check different possible response formats
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serverList: any[] =
        data.success && data.data && data.data.mcpServers
          ? data.data.mcpServers
          : Array.isArray(data.data)
            ? data.data
            : Array.isArray(data)
              ? data
              : [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      foundServer = serverList.find((server: any) => server.id === serverId);

      if (foundServer) {
        setMcpDetails((prev) => ({
          ...prev,
          [serverId]: {
            id: foundServer.id || serverId,

            name: foundServer.name || serverId,

            description: foundServer.description || "",

            config: foundServer.config || {},

            version: foundServer.version,

            keywords: foundServer.keywords,

            author: foundServer.author,
          },
        }));
        console.log(`MCP detail for ${serverId}:`, foundServer);
      } else {
        console.warn(`MCP ${serverId} not found in server list`);
        toast({
          title: "Warning",
          description: `MCP ${serverId} not found`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(`Failed to fetch MCP details:`, error);
      toast({
        title: "Warning",
        description: `Could not load details for MCP: ${serverId}`,
        variant: "destructive",
      });
    } finally {
      setLoadingMcpDetails((prev) => {
        const newSet = new Set(prev);
        newSet.delete(serverId);
        return newSet;
      });
    }
  };

  // Handle MCP selection change
  const handleMcpSelectionChange = (serverId: string, isChecked: boolean) => {
    if (isChecked) {
      setFormData({
        ...formData,
        selectedMCPs: [...formData.selectedMCPs, serverId],
      });
      // Fetch detailed config when MCP is selected
      fetchMcpDetail(serverId);
    } else {
      setFormData({
        ...formData,
        selectedMCPs: formData.selectedMCPs.filter((id) => id !== serverId),
      });
    }
  };

  useEffect(() => {
    fetchAgents();
    fetchMcpOptions();
  }, []);

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
  };

  const openCreateDialog = () => {
    resetForm();
    setInitialAgentMcpIds([]);
    setDialogOpen(true);
  };

  const openEditDialog = (agent: MarketAgent) => {
    setInitialAgentMcpIds(agent.selectedMCPs || []);
    setFormData({
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      predefined: agent.predefined,
      selectedMCPs: agent.selectedMCPs || [],
      disableToolsStr: agent.disableToolReferences?.join(", ") || "",
    });
    setEditingAgent(agent);
    setDialogOpen(true);

    // Pre-fetch details for selected MCPs
    (agent.selectedMCPs || []).forEach((mcpId) => {
      fetchMcpDetail(mcpId);
    });
  };

  const saveAgent = async () => {
    try {
      const method = editingAgent ? "PUT" : "POST";
      const url = editingAgent
        ? `${getBaseURL()}/api/agent-market/update-agent-in-market/${editingAgent.id}`
        : `${getBaseURL()}/api/agent-market/create-agent-in-market`;

      // Prepare agentJson with only MCP names in selectedMCPs
      const agentJson = {
        name: formData.name,
        description: formData.description,
        systemPrompt: formData.systemPrompt,
        predefined: formData.predefined,
        selectedMCPs: formData.selectedMCPs, // Only MCP names/IDs
        disableToolReferences: formData.disableToolsStr
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Prepare complete MCP installations with full configs
      const mcpInstallations: Record<string, any> = {};
      formData.selectedMCPs.forEach((mcpId) => {
        const detail = mcpDetails[mcpId];
        if (detail) {
          // Include complete MCP server definition
          mcpInstallations[mcpId] = {
            id: detail.id,
            name: detail.name,
            description: detail.description,
            version: detail.version,
            keywords: detail.keywords || [],
            author: detail.author || { name: "", url: "" },
            config: detail.config,
            command: detail.config.command,
            args: detail.config.args || [],
            url: detail.config.url,
            apiKey: detail.config.apiKey,
            cwd: detail.config.cwd,
            env: detail.config.env,
          };
        }
      });

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentJson: JSON.stringify(agentJson), // Convert to JSON string
          mcpInstallations: JSON.stringify(mcpInstallations), // Convert to JSON string
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Save error:", errorData);
        throw new Error(errorData.error?.message || "Failed to save agent");
      }

      toast({ title: "Success", description: `Agent ${editingAgent ? "updated" : "created"}` });
      setDialogOpen(false);
      resetForm();
      fetchAgents();
    } catch (error) {
      console.error("Save agent error:", error);
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const deleteAgent = async (agentId: string | number) => {
    if (!confirm("Are you sure you want to delete this agent?")) return;
    try {
      const res = await fetch(
        `${getBaseURL()}/api/agent-market/delete-agent-in-market/${agentId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to delete agent");
      toast({ title: "Success", description: "Agent deleted" });
      fetchAgents();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete agent", variant: "destructive" });
    }
  };

  const downloadAgent = async (agentId: string | number) => {
    try {
      const res = await fetch(
        `${getBaseURL()}/api/agent-market/download-or-get-agent-in-market/${agentId}`,
        {
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to download agent");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${agentId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Error", description: "Download failed", variant: "destructive" });
    }
  };

  // JSON import (from existing MCP or raw)
  const importJsonFile = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      // Assume json matches AgentDefinition
      const res = await fetch(`${getBaseURL()}/api/agent-market/create-agent-in-market`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(json),
      });
      if (!res.ok) throw new Error("Import failed");
      toast({ title: "Success", description: "Agent imported" });
      fetchAgents();
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid JSON or import failed",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Agent Market</h2>
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
            {loading ? (
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
                    {agent.selectedMCPs && agent.selectedMCPs.length > 0
                      ? agent.selectedMCPs.join(", ")
                      : agent.mcpInstallations
                        ? Object.keys(agent.mcpInstallations).join(", ")
                        : "-"}
                  </TableCell>
                  <TableCell>{agent.predefined ? "Yes" : "No"}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="icon" variant="outline" onClick={() => openEditDialog(agent)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="outline" onClick={() => downloadAgent(agent.id)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="destructive" onClick={() => deleteAgent(agent.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog for create/edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAgent ? "Edit Agent" : "Create Agent"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="name">
                Name
              </label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="description">
                Description
              </label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="systemPrompt">
                System Prompt
              </label>
              <Textarea
                id="systemPrompt"
                value={formData.systemPrompt}
                onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Select MCPs</label>
              <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-md border p-2">
                <TooltipProvider>
                  {[...new Set([...mcpOptions.map((o) => o.serverId), ...initialAgentMcpIds])].map(
                    (opt) => (
                      <div key={opt} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={formData.selectedMCPs.includes(opt)}
                          onChange={(e) => handleMcpSelectionChange(opt, e.target.checked)}
                        />
                        <span className="flex-1">
                          {mcpOptions.find((m) => m.serverId === opt)?.name || opt}
                        </span>
                        {formData.selectedMCPs.includes(opt) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 cursor-help text-blue-500" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              {loadingMcpDetails.has(opt) ? (
                                <p>Loading configuration...</p>
                              ) : mcpDetails[opt] ? (
                                <div className="space-y-1">
                                  <p>
                                    <strong>Name:</strong> {mcpDetails[opt].name}
                                  </p>
                                  <p>
                                    <strong>Description:</strong>{" "}
                                    {mcpDetails[opt].description || "N/A"}
                                  </p>
                                  {mcpDetails[opt].config.command && (
                                    <p>
                                      <strong>Command:</strong> {mcpDetails[opt].config.command}
                                    </p>
                                  )}
                                  {mcpDetails[opt].config.args &&
                                    mcpDetails[opt].config.args.length > 0 && (
                                      <p>
                                        <strong>Args:</strong>{" "}
                                        {mcpDetails[opt].config.args.join(", ")}
                                      </p>
                                    )}
                                  {mcpDetails[opt].config.url && (
                                    <p>
                                      <strong>URL:</strong> {mcpDetails[opt].config.url}
                                    </p>
                                  )}
                                  {mcpDetails[opt].version && (
                                    <p>
                                      <strong>Version:</strong> {mcpDetails[opt].version}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p>Configuration not available</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    ),
                  )}
                </TooltipProvider>
                {mcpOptions.length === 0 && (
                  <span className="text-muted-foreground">No MCPs found</span>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="disableTools">
                Disabled Tools (comma separated)
              </label>
              <Input
                id="disableTools"
                value={formData.disableToolsStr}
                onChange={(e) => setFormData({ ...formData, disableToolsStr: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="predefined"
                className="h-4 w-4"
                checked={formData.predefined}
                onChange={(e) => setFormData({ ...formData, predefined: e.target.checked })}
              />
              <label htmlFor="predefined" className="text-sm">
                Predefined (system agent)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveAgent}>{editingAgent ? "Save Changes" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
