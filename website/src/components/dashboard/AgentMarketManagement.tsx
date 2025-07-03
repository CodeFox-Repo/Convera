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
import {
  Dialog,
  DialogContent,
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
import { getBaseURL, useSession } from "@/lib/auth-client";
import { Download, Edit, Info, Plus, Trash2, Upload, X } from "lucide-react";
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

// MCP Server configuration structure
export interface MCPServerConfig {
  name?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  apiKey?: string;
  description?: string;
  isSSE?: boolean;
}

interface MCPFormData {
  name: string;
  command: string;
  args: string;
  url: string;
  apiKey: string;
  description: string;
  cwd: string;
  env: string;
  isSSE: boolean;
}

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
  const [customizedMcpConfigs, setCustomizedMcpConfigs] = useState<
    Record<string, MCPDetailedConfig>
  >({});
  const [selectedMcpForEdit, setSelectedMcpForEdit] = useState<string>("");

  // Add MCP form data state
  const [mcpFormData, setMcpFormData] = useState<MCPFormData>({
    name: "",
    command: "",
    args: "",
    url: "",
    apiKey: "",
    description: "",
    cwd: "",
    env: "",
    isSSE: false,
  });

  // Keywords and arguments management for MCP form
  const [keywordsList, setKeywordsList] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [argumentsList, setArgumentsList] = useState<string[]>([]);
  const [argumentInput, setArgumentInput] = useState("");
  const [envList, setEnvList] = useState<Array<{ key: string; value: string }>>([]);
  const [envKeyInput, setEnvKeyInput] = useState("");
  const [envValueInput, setEnvValueInput] = useState("");

  // Disabled tools management for agent form
  const [disabledToolsList, setDisabledToolsList] = useState<string[]>([]);
  const [disabledToolInput, setDisabledToolInput] = useState("");

  // Add buffer for tracking MCPs to be deleted after save
  const [mcpsToDelete, setMcpsToDelete] = useState<Set<string>>(new Set());
  const [allAvailableMcps, setAllAvailableMcps] = useState<Set<string>>(new Set());

  // Add custom MCP functionality
  const [customMcpName, setCustomMcpName] = useState("");
  const [isAddingCustomMcp, setIsAddingCustomMcp] = useState(false);

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
    // Skip fetching for custom MCPs
    if (serverId.startsWith("custom-")) {
      return;
    }

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let foundServer: any = null;

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            id: (foundServer as any).id || serverId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            name: (foundServer as any).name || serverId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            description: (foundServer as any).description || "",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config: (foundServer as any).config || {},
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            version: (foundServer as any).version,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            keywords: (foundServer as any).keywords,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            author: (foundServer as any).author,
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

  // Get all MCPs (both available and installed) and sort by selection status
  const getAllMcpOptions = () => {
    // Always include all available MCPs from market
    const availableMcps = mcpOptions.map((opt) => opt.serverId);

    // Include MCPs that were initially installed (from agent.mcpInstallations)
    const installedMcps = initialAgentMcpIds;

    // Include ALL custom MCPs that have been created (don't filter by mcpsToDelete here)
    const customMcps = Object.keys(customizedMcpConfigs).filter((id) => id.startsWith("custom-"));

    // Include any additional MCPs from the buffer (for cases where they might not be in other lists)
    const allFromBuffer = Array.from(allAvailableMcps);

    // Combine ALL MCP IDs and remove duplicates
    // For custom MCPs, we keep them visible even if marked for deletion (they disappear only after save)
    // For regular MCPs, we never mark them for deletion anyway
    const allMcpIds = [
      ...new Set([...availableMcps, ...installedMcps, ...customMcps, ...allFromBuffer]),
    ];

    // Sort by selection status: selected MCPs first, then unselected
    return allMcpIds.sort((a, b) => {
      const aSelected = formData.selectedMCPs.includes(a);
      const bSelected = formData.selectedMCPs.includes(b);

      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return 0;
    });
  };

  // Load MCP form data when selected MCP changes
  const loadMcpFormData = (serverId: string) => {
    const effectiveConfig = getEffectiveMcpConfig(serverId);

    if (effectiveConfig) {
      // Parse args
      const args = Array.isArray(effectiveConfig.config?.args) ? effectiveConfig.config.args : [];

      // Parse keywords
      const keywords = Array.isArray(effectiveConfig.keywords) ? effectiveConfig.keywords : [];

      // Parse env
      const env = effectiveConfig.config?.env || {};

      setKeywordsList(keywords);
      setArgumentsList(args);
      setEnvList(Object.entries(env).map(([key, value]) => ({ key, value })));

      setMcpFormData({
        name: effectiveConfig.name || "",
        command: effectiveConfig.config?.command || "",
        args: args.join(", "),
        url: effectiveConfig.config?.url || "",
        apiKey: effectiveConfig.config?.apiKey || "",
        description: effectiveConfig.description || "",
        cwd: effectiveConfig.config?.cwd || "",
        env: Object.entries(env)
          .map(([k, v]) => `${k}=${v}`)
          .join(", "),
        isSSE: effectiveConfig.config?.isSSE || false,
      });
    } else {
      // Reset form for new MCP
      setMcpFormData({
        name: serverId,
        command: "",
        args: "",
        url: "",
        apiKey: "",
        description: "",
        cwd: "",
        env: "",
        isSSE: false,
      });
      setKeywordsList([]);
      setArgumentsList([]);
      setEnvList([]);
    }
  };

  // Update MCP config from form
  const updateMcpFromForm = () => {
    if (!selectedMcpForEdit) return;

    // Parse env string into object
    const envObj: Record<string, string> = {};
    if (mcpFormData.env) {
      mcpFormData.env.split(",").forEach((pair) => {
        const [key, value] = pair.split("=").map((s) => s.trim());
        if (key && value) {
          envObj[key] = value;
        }
      });
    }

    // Parse args string into array
    const argumentsList = mcpFormData.args
      ? mcpFormData.args
          .split(",")
          .map((arg) => arg.trim())
          .filter((arg) => arg)
      : [];

    const updatedConfig: MCPDetailedConfig = {
      id: mcpFormData.name,
      name: mcpFormData.name,
      description: mcpFormData.description,
      config: {
        command: mcpFormData.command || undefined,
        args: argumentsList.length > 0 ? argumentsList : undefined,
        url: mcpFormData.url || undefined,
        apiKey: mcpFormData.apiKey || undefined,
        cwd: mcpFormData.cwd || undefined,
        env: Object.keys(envObj).length > 0 ? envObj : undefined,
        isSSE: mcpFormData.isSSE,
      },
      version: "1.0.0", // Default version
      keywords: [], // Empty keywords for now
      author: {
        name: "", // Default empty author
        url: "",
      },
    };

    setCustomizedMcpConfigs((prev) => ({
      ...prev,
      [selectedMcpForEdit]: updatedConfig,
    }));
  };

  // Keyword management functions
  const addKeyword = () => {
    if (keywordInput.trim() && !keywordsList.includes(keywordInput.trim())) {
      setKeywordsList([...keywordsList, keywordInput.trim()]);
      setKeywordInput("");
      updateMcpFromForm();
    }
  };

  const removeKeyword = (keyword: string) => {
    setKeywordsList(keywordsList.filter((k) => k !== keyword));
    updateMcpFromForm();
  };

  const handleKeywordInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addKeyword();
    }
  };

  // Argument management functions
  const addArgument = () => {
    if (argumentInput.trim() && !argumentsList.includes(argumentInput.trim())) {
      setArgumentsList([...argumentsList, argumentInput.trim()]);
      setArgumentInput("");
      updateMcpFromForm();
    }
  };

  const removeArgument = (arg: string) => {
    setArgumentsList(argumentsList.filter((a) => a !== arg));
    updateMcpFromForm();
  };

  const handleArgumentInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addArgument();
    }
  };

  // Environment variable management functions
  const addEnvVar = () => {
    if (envKeyInput.trim() && envValueInput.trim()) {
      const exists = envList.some((env) => env.key === envKeyInput.trim());
      if (!exists) {
        setEnvList([...envList, { key: envKeyInput.trim(), value: envValueInput.trim() }]);
        setEnvKeyInput("");
        setEnvValueInput("");
        updateMcpFromForm();
      }
    }
  };

  const removeEnvVar = (index: number) => {
    setEnvList(envList.filter((_, i) => i !== index));
    updateMcpFromForm();
  };

  // Disabled tools management functions
  const addDisabledTool = () => {
    if (disabledToolInput.trim() && !disabledToolsList.includes(disabledToolInput.trim())) {
      setDisabledToolsList([...disabledToolsList, disabledToolInput.trim()]);
      setDisabledToolInput("");
      // Update form data
      setFormData({
        ...formData,
        disableToolsStr: [...disabledToolsList, disabledToolInput.trim()].join(", "),
      });
    }
  };

  const removeDisabledTool = (tool: string) => {
    const newList = disabledToolsList.filter((t) => t !== tool);
    setDisabledToolsList(newList);
    // Update form data
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

  // Update the handleMcpSelectionChange function
  const handleMcpSelectionChange = (serverId: string, isChecked: boolean) => {
    if (isChecked) {
      // Add to selected MCPs
      setFormData({
        ...formData,
        selectedMCPs: [...formData.selectedMCPs, serverId],
      });
      // Remove from delete buffer if it was marked for deletion (only for custom MCPs)
      setMcpsToDelete((prev) => {
        const newSet = new Set(prev);
        newSet.delete(serverId);
        return newSet;
      });
      // Fetch detailed config when MCP is selected (skip for custom MCPs)
      fetchMcpDetail(serverId);
      // Set first selected MCP for editing if none selected
      if (!selectedMcpForEdit) {
        setSelectedMcpForEdit(serverId);
        loadMcpFormData(serverId);
      }
    } else {
      // Remove from selected MCPs - but MCP stays visible in the list
      setFormData({
        ...formData,
        selectedMCPs: formData.selectedMCPs.filter((id) => id !== serverId),
      });
      // Only mark custom MCPs for deletion - market MCPs should always remain visible
      if (serverId.startsWith("custom-")) {
        setMcpsToDelete((prev) => new Set([...prev, serverId]));
      }
      // Change selected MCP if the current one was unselected
      if (selectedMcpForEdit === serverId) {
        const remaining = formData.selectedMCPs.filter((id) => id !== serverId);
        const newSelected = remaining.length > 0 ? remaining[0] : "";
        setSelectedMcpForEdit(newSelected);
        if (newSelected) {
          loadMcpFormData(newSelected);
        }
      }
    }
  };

  // Update the selected MCP change handler
  const handleSelectedMcpChange = (serverId: string) => {
    setSelectedMcpForEdit(serverId);
    loadMcpFormData(serverId);
  };

  // Get effective MCP config (customized or original)
  const getEffectiveMcpConfig = (serverId: string): MCPDetailedConfig | null => {
    return customizedMcpConfigs[serverId] || mcpDetails[serverId] || null;
  };

  // Generate JSON string for selected MCP
  const generateMcpJsonString = (serverId: string): string => {
    const config = getEffectiveMcpConfig(serverId);
    if (!config) return "{}";

    return JSON.stringify(
      {
        id: config.id,
        name: config.name,
        description: config.description,
        version: config.version,
        keywords: config.keywords || [],
        author: config.author || { name: "", url: "" },
        config: config.config,
      },
      null,
      2,
    );
  };

  // Update MCP config from JSON
  const updateMcpFromJson = (serverId: string, jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      const updatedConfig: MCPDetailedConfig = {
        id: parsed.id || serverId,
        name: parsed.name || serverId,
        description: parsed.description || "",
        config: parsed.config || {},
        version: parsed.version,
        keywords: parsed.keywords,
        author: parsed.author,
      };

      setCustomizedMcpConfigs((prev) => ({
        ...prev,
        [serverId]: updatedConfig,
      }));

      return true;
    } catch (error) {
      console.error("Failed to parse MCP JSON:", error);
      return false;
    }
  };

  // Add custom MCP functionality
  const addCustomMcp = () => {
    if (!customMcpName.trim()) return;

    const customId = `custom-${customMcpName.trim()}`;

    // Add to selected MCPs
    setFormData({
      ...formData,
      selectedMCPs: [...formData.selectedMCPs, customId],
    });

    // Create default config for custom MCP
    const defaultConfig: MCPDetailedConfig = {
      id: customId,
      name: customMcpName.trim(),
      description: "",
      config: {
        command: "",
        args: [],
        url: "",
        apiKey: "",
        cwd: "",
        env: {},
        isSSE: false,
      },
      version: "1.0.0",
      keywords: [],
      author: { name: "", url: "" },
    };

    // Add to customized configs
    setCustomizedMcpConfigs((prev) => ({
      ...prev,
      [customId]: defaultConfig,
    }));

    // Select for editing
    setSelectedMcpForEdit(customId);
    loadMcpFormData(customId);

    // Reset states
    setCustomMcpName("");
    setIsAddingCustomMcp(false);
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
    setCustomizedMcpConfigs({});
    setSelectedMcpForEdit("");
    setDisabledToolsList([]);
    setDisabledToolInput("");
    // Reset buffer data
    setMcpsToDelete(new Set());
    setAllAvailableMcps(new Set());
  };

  const openCreateDialog = () => {
    resetForm();
    setInitialAgentMcpIds([]);
    // Initialize buffer with available MCPs for create mode
    const availableMcps = mcpOptions.map((opt) => opt.serverId);
    setAllAvailableMcps(new Set(availableMcps));
    setDialogOpen(true);
  };

  const openEditDialog = (agent: MarketAgent) => {
    setInitialAgentMcpIds(agent.selectedMCPs || []);
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

    // Initialize buffer with all MCPs that will be available
    const availableMcps = mcpOptions.map((opt) => opt.serverId);
    const installedMcps = agent.selectedMCPs || [];
    const allMcps = [...new Set([...availableMcps, ...installedMcps])];
    setAllAvailableMcps(new Set(allMcps));

    // Reset delete buffer
    setMcpsToDelete(new Set());

    // Load existing customized MCP configurations from the agent's mcpInstallations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingCustomizations: Record<string, any> = {};
    if (agent.mcpInstallations) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(agent.mcpInstallations as any).forEach(
        ([mcpId, installation]: [string, any]) => {
          // Convert MCPInstallation to MCPDetailedConfig format
          existingCustomizations[mcpId] = {
            id: mcpId,
            name: installation.name || mcpId,
            description: installation.description || "",
            config: installation.config || {
              command: installation.command,
              args: installation.args,
              url: installation.url,
              apiKey: installation.apiKey,
              cwd: installation.cwd,
              env: installation.env,
            },
            version: installation.version,
            keywords: installation.keywords || [],
            author: installation.author || { name: "" },
          };
        },
      );
    }
    setCustomizedMcpConfigs(existingCustomizations);

    setDialogOpen(true);

    // Pre-fetch details for selected MCPs to get complete metadata
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

      // Create mcpInstallations object with only selected MCPs
      const mcpInstallations: Record<string, MCPInstallation> = {};
      formData.selectedMCPs.forEach((mcpId) => {
        const config = getEffectiveMcpConfig(mcpId);
        if (config) {
          // Use the simplified MCPInstallation format
          mcpInstallations[mcpId] = {
            command: config.config.command,
            args: config.config.args,
            cwd: config.config.cwd,
            env: config.config.env,
            url: config.config.url,
            apiKey: config.config.apiKey,
            description: config.description,
          };
        }
      });

      // Apply buffered deletions - remove MCPs marked for deletion from customizedMcpConfigs
      const cleanedCustomizedConfigs = { ...customizedMcpConfigs };
      mcpsToDelete.forEach((mcpId) => {
        delete cleanedCustomizedConfigs[mcpId];
      });
      setCustomizedMcpConfigs(cleanedCustomizedConfigs);

      // Clear the delete buffer after save
      setMcpsToDelete(new Set());

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

  // Delete agent with confirmation
  const deleteAgent = async (agentId: string | number) => {
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
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadAgent(agent.id)}
                        className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700"
                        title="Download agent"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(agent)}
                        className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700"
                        title="Edit agent"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-gray-500 hover:text-red-600"
                            title="Delete agent"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{agent.name}"? This action cannot be
                              undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteAgent(agent.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
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

      {/* Dialog for create/edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-7xl">
          <DialogHeader>
            <DialogTitle>{editingAgent ? "Edit Agent" : "Create Agent"}</DialogTitle>
          </DialogHeader>
          <div className="flex h-[600px] gap-6 py-4">
            {/* Left Panel - Form Fields */}
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
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
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Select MCPs</label>
                  {/* All available MCPs are always shown here, regardless of selection status */}
                  {isAddingCustomMcp ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={customMcpName}
                        onChange={(e) => setCustomMcpName(e.target.value)}
                        placeholder="Enter custom MCP name"
                        className="h-8 w-40 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomMcp();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        onClick={addCustomMcp}
                        disabled={!customMcpName.trim()}
                        size="sm"
                        variant="outline"
                        className="h-8"
                      >
                        Add
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          setIsAddingCustomMcp(false);
                          setCustomMcpName("");
                        }}
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => setIsAddingCustomMcp(true)}
                      size="sm"
                      variant="outline"
                      className="h-8"
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Custom
                    </Button>
                  )}
                </div>
                <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-md border p-2">
                  <TooltipProvider>
                    {getAllMcpOptions().map((opt) => (
                      <div key={opt} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={formData.selectedMCPs.includes(opt)}
                          onChange={(e) => handleMcpSelectionChange(opt, e.target.checked)}
                        />
                        <span
                          className={`flex-1 cursor-pointer ${selectedMcpForEdit === opt ? "font-medium text-blue-600" : ""} ${mcpsToDelete.has(opt) ? "text-gray-400 line-through" : ""}`}
                          onClick={() =>
                            formData.selectedMCPs.includes(opt) && handleSelectedMcpChange(opt)
                          }
                        >
                          {/* Display custom MCP name or find from options */}
                          {opt.startsWith("custom-")
                            ? customizedMcpConfigs[opt]?.name || opt.replace("custom-", "")
                            : mcpOptions.find((m) => m.serverId === opt)?.name || opt}
                          {customizedMcpConfigs[opt] && (
                            <span className="ml-1 text-orange-500">*</span>
                          )}
                          {mcpsToDelete.has(opt) && (
                            <span className="ml-1 text-red-500" title="Will be deleted on save">
                              (×)
                            </span>
                          )}
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
                    ))}
                  </TooltipProvider>
                  {mcpOptions.length === 0 && (
                    <span className="text-muted-foreground">No MCPs found</span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Disabled Tools</label>
                <div className="space-y-2">
                  {disabledToolsList.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {disabledToolsList.map((tool, index) => (
                        <Badge key={index} variant="destructive" className="gap-1">
                          {tool}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => removeDisabledTool(tool)}
                          />
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={disabledToolInput}
                      onChange={(e) => setDisabledToolInput(e.target.value)}
                      onKeyDown={handleDisabledToolInputKeyDown}
                      placeholder="Add disabled tool and press Enter"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={addDisabledTool}
                      disabled={!disabledToolInput.trim()}
                      size="sm"
                      variant="outline"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">Tools that will be disabled for this agent</p>
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
            {/* Right Panel - MCP Configuration */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-base font-medium">MCP Configuration</label>
                {selectedMcpForEdit && (
                  <div className="flex gap-2">
                    <select
                      value={selectedMcpForEdit}
                      onChange={(e) => handleSelectedMcpChange(e.target.value)}
                      className="rounded border px-2 py-1 text-sm"
                    >
                      {getAllMcpOptions().map((mcpId) => (
                        <option key={mcpId} value={mcpId}>
                          {mcpId.startsWith("custom-")
                            ? customizedMcpConfigs[mcpId]?.name || mcpId.replace("custom-", "")
                            : mcpOptions.find((m) => m.serverId === mcpId)?.name || mcpId}
                          {customizedMcpConfigs[mcpId] ? " *" : ""}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(generateMcpJsonString(selectedMcpForEdit));
                        toast({
                          title: "Success",
                          description: "MCP configuration copied to clipboard",
                        });
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                )}
              </div>

              {selectedMcpForEdit && formData.selectedMCPs.includes(selectedMcpForEdit) ? (
                <div className="h-[500px] space-y-4 overflow-y-auto pr-2">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={mcpFormData.name}
                      onChange={(e) => {
                        setMcpFormData({ ...mcpFormData, name: e.target.value });
                        updateMcpFromForm();
                      }}
                      placeholder="MCP name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={mcpFormData.description}
                      onChange={(e) => {
                        setMcpFormData({ ...mcpFormData, description: e.target.value });
                        updateMcpFromForm();
                      }}
                      placeholder="MCP description"
                      className="min-h-[60px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Command</Label>
                    <Input
                      value={mcpFormData.command}
                      onChange={(e) => {
                        setMcpFormData({ ...mcpFormData, command: e.target.value });
                        updateMcpFromForm();
                      }}
                      placeholder="Command to run (e.g., npx, node)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Arguments</Label>
                    <div className="space-y-2">
                      {argumentsList.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {argumentsList.map((arg, index) => (
                            <Badge key={index} variant="secondary" className="gap-1">
                              {arg}
                              <X
                                className="h-3 w-3 cursor-pointer"
                                onClick={() => removeArgument(arg)}
                              />
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input
                          value={argumentInput}
                          onChange={(e) => setArgumentInput(e.target.value)}
                          onKeyDown={handleArgumentInputKeyDown}
                          placeholder="Add argument and press Enter"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          onClick={addArgument}
                          disabled={!argumentInput.trim()}
                          size="sm"
                          variant="outline"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input
                      value={mcpFormData.url}
                      onChange={(e) => {
                        setMcpFormData({ ...mcpFormData, url: e.target.value });
                        updateMcpFromForm();
                      }}
                      placeholder="Server URL (for remote MCPs)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      value={mcpFormData.apiKey}
                      onChange={(e) => {
                        setMcpFormData({ ...mcpFormData, apiKey: e.target.value });
                        updateMcpFromForm();
                      }}
                      placeholder="API key (if required)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Working Directory</Label>
                    <Input
                      value={mcpFormData.cwd}
                      onChange={(e) => {
                        setMcpFormData({ ...mcpFormData, cwd: e.target.value });
                        updateMcpFromForm();
                      }}
                      placeholder="Working directory path"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Environment Variables</Label>
                    <div className="space-y-2">
                      {envList.length > 0 && (
                        <div className="space-y-1">
                          {envList.map((env, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <div className="flex-1 rounded border bg-gray-50 p-2">
                                <span className="font-mono text-sm">
                                  {env.key}={env.value}
                                </span>
                              </div>
                              <Button
                                type="button"
                                onClick={() => removeEnvVar(index)}
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input
                          value={envKeyInput}
                          onChange={(e) => setEnvKeyInput(e.target.value)}
                          placeholder="Key"
                          className="flex-1"
                        />
                        <Input
                          value={envValueInput}
                          onChange={(e) => setEnvValueInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addEnvVar();
                            }
                          }}
                          placeholder="Value"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          onClick={addEnvVar}
                          disabled={!envKeyInput.trim() || !envValueInput.trim()}
                          size="sm"
                          variant="outline"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="isSSE"
                      className="h-4 w-4"
                      checked={mcpFormData.isSSE}
                      onChange={(e) => {
                        setMcpFormData({ ...mcpFormData, isSSE: e.target.checked });
                        updateMcpFromForm();
                      }}
                    />
                    <Label htmlFor="isSSE" className="text-sm">
                      Server-Sent Events (SSE)
                    </Label>
                  </div>
                </div>
              ) : (
                <div className="flex h-[500px] items-center justify-center rounded border text-gray-500">
                  {formData.selectedMCPs.length === 0
                    ? "Select MCPs to view their configuration"
                    : "Select an MCP from the dropdown above"}
                </div>
              )}

              <p className="text-xs text-gray-500">
                View-only MCP configuration details. Select different MCPs from the dropdown above.
              </p>
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
