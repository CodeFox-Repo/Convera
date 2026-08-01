import { Badge } from "@/renderer/components/ui/badge";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/renderer/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/renderer/components/ui/tooltip";
import { FullEmojiPicker } from "@/renderer/components/common/emoji-picker";
import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import { ConfirmDialog } from "@/renderer/components/talent/confirm-dialog";
import { describeAgentRemoval } from "@/renderer/libs/agent-templates";
import { memberForAgent, memberIdForAgent } from "@/renderer/libs/db";
import { useChannels } from "@/renderer/libs/stores/channel-store";
import {
  getMember,
  updateMemberProfile,
  useMember,
  type Member,
} from "@/renderer/libs/stores/member-store";
import { useLocalAIProviders } from "@/renderer/libs/hooks/use-local-ai-providers";
import { describeProviderStatus } from "@/renderer/libs/provider-status";
import { useAgentStore, type Agent } from "@/renderer/libs/stores/agent-store";
import { useMcpStore } from "@/renderer/libs/stores/mcp-store";
import { ToolDefinition } from "@/shared/types/mcp";
import {
  AlertTriangle,
  Bot,
  Code,
  FileText,
  Loader2,
  MessageCircle,
  PenTool,
  Plus,
  Server,
  Settings,
  Smile,
  Trash2,
  Zap,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fileToAvatarDataUrl } from "../profile-avatar";

interface AgentsSettingsPageProps {
  onNavigateToMcp: () => void;
}

interface AgentFormData {
  name: string;
  description: string;
  systemPrompt: string;
  /** "" follows the conversation's own selection. */
  providerId: string;
  modelId: string;
  /**
   * Emoji or 128px `data:` URL. Lives on the Member row, not the Agent — it is
   * carried through the form so create and edit look the same to the user.
   */
  avatar: string | null;
}

const EMPTY_AGENT_FORM: AgentFormData = {
  name: "",
  description: "",
  systemPrompt: "",
  providerId: "",
  modelId: "",
  avatar: null,
};

/** Encodes provider+model as one select value, since they only vary together. */
const MODEL_VALUE_SEPARATOR = "::";
const INHERIT_MODEL_VALUE = "inherit";

interface DisabledTool {
  mcpName: string;
  toolName: string;
}

const AGENT_TEMPLATES = [
  {
    id: "coding",
    name: "Code Assistant",
    description: "Help with programming and development tasks",
    icon: <Code className="h-5 w-5" />,
    systemPrompt:
      "You are a skilled programming assistant. Help users write clean, efficient code and solve technical problems. Always explain your reasoning and provide examples when helpful.",
  },
  {
    id: "writing",
    name: "Writing Assistant",
    description: "Help with writing, editing, and content creation",
    icon: <PenTool className="h-5 w-5" />,
    systemPrompt:
      "You are a professional writing assistant. Help users improve their writing, fix grammar, suggest better phrasing, and create engaging content. Be constructive and encouraging.",
  },
  {
    id: "research",
    name: "Research Assistant",
    description: "Help with research and information gathering",
    icon: <FileText className="h-5 w-5" />,
    systemPrompt:
      "You are a thorough research assistant. Help users find reliable information, analyze data, and synthesize findings. Always cite sources and present balanced perspectives.",
  },
  {
    id: "general",
    name: "General Assistant",
    description: "A versatile assistant for everyday tasks",
    icon: <MessageCircle className="h-5 w-5" />,
    systemPrompt:
      "You are a helpful, friendly assistant. Assist users with a wide variety of tasks while being clear, concise, and supportive.",
  },
];

/**
 * A face for a colleague you wrote yourself. Templates ship with a portrait;
 * without this a custom agent is a grey glyph in every channel it speaks in.
 */
const AvatarField = ({
  form,
  onChange,
}: {
  form: AgentFormData;
  onChange: (form: AgentFormData) => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview: Member = {
    ...memberForAgent({ id: "preview", name: form.name }),
    avatar: form.avatar,
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      onChange({ ...form, avatar: await fileToAvatarDataUrl(file) });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not read that image.",
      );
    }
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <MemberAvatar
          member={preview}
          isHuman={false}
          className="size-12 text-base"
          fallback={<Bot className="h-5 w-5 text-primary" />}
        />
        <div>
          <Label className="text-foreground">Avatar</Label>
          <p className="text-xs text-muted-foreground">
            {error ?? "An emoji, or an image cropped square at 128px."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="border-border">
              <Smile className="h-4 w-4" />
              Emoji
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto overflow-hidden p-1">
            <FullEmojiPicker
              onPick={(emoji) => {
                onChange({ ...form, avatar: emoji });
                setEmojiOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void pickImage(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="border-border"
          onClick={() => fileInputRef.current?.click()}
        >
          Image
        </Button>
        {form.avatar && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...form, avatar: null })}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
};

const AgentFormFields = ({
  form,
  onChange,
  idPrefix = "",
}: {
  form: AgentFormData;
  onChange: (form: AgentFormData) => void;
  idPrefix?: string;
}) => {
  const { providers, loading: providersLoading } = useLocalAIProviders();
  const modelValue = form.providerId
    ? `${form.providerId}${MODEL_VALUE_SEPARATOR}${form.modelId}`
    : INHERIT_MODEL_VALUE;
  // Pinning a colleague to a provider that cannot run makes an agent that
  // silently never answers. Say so while the choice is still being made.
  const pinned = form.providerId
    ? providers.find((provider) => provider.id === form.providerId)
    : undefined;
  const pinnedStatus = pinned
    ? describeProviderStatus(pinned, providersLoading)
    : undefined;

  return (
    <div className="space-y-4">
      <AvatarField form={form} onChange={onChange} />

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}agent-name`} className="text-foreground">
          Name
        </Label>
        <Input
          id={`${idPrefix}agent-name`}
          value={form.name}
          className="text-foreground"
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="Enter agent name"
          maxLength={50}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor={`${idPrefix}agent-description`}
          className="text-foreground"
        >
          Description
        </Label>
        <Input
          id={`${idPrefix}agent-description`}
          value={form.description}
          className="text-foreground"
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="Brief description of what this agent does"
          maxLength={100}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}agent-prompt`} className="text-foreground">
          System Prompt
        </Label>
        <textarea
          id={`${idPrefix}agent-prompt`}
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-[120px] w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
          value={form.systemPrompt}
          onChange={(e) => onChange({ ...form, systemPrompt: e.target.value })}
          placeholder="Define the agent's personality, behavior, and capabilities..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}agent-model`} className="text-foreground">
          Model
        </Label>
        <select
          id={`${idPrefix}agent-model`}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-[3px]"
          value={modelValue}
          onChange={(event) => {
            const [providerId = "", modelId = ""] =
              event.target.value === INHERIT_MODEL_VALUE
                ? []
                : event.target.value.split(MODEL_VALUE_SEPARATOR);
            onChange({ ...form, providerId, modelId });
          }}
        >
          <option value={INHERIT_MODEL_VALUE}>
            Follow the conversation&apos;s model
          </option>
          {providers.map((provider) =>
            (provider.models ?? []).map((model) => {
              const id = typeof model === "string" ? model : model.id;
              return (
                <option
                  key={`${provider.id}${MODEL_VALUE_SEPARATOR}${id}`}
                  value={`${provider.id}${MODEL_VALUE_SEPARATOR}${id}`}
                >
                  {provider.name} · {id}
                </option>
              );
            }),
          )}
        </select>
        {pinnedStatus && !pinnedStatus.ready && !providersLoading ? (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
            <span className="leading-relaxed">
              {pinned?.name} is not ready, so this agent will not be able to
              answer. {pinnedStatus.hint}
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Each colleague can run on its own model — a reviewer on a stronger
            one, a note-taker on something cheap.
          </p>
        )}
      </div>
    </div>
  );
};

const ToolBadge = ({
  tool,
  serverId,
  disabled,
  onToggle,
}: {
  tool: ToolDefinition;
  serverId: string;
  disabled: boolean;
  onToggle: (mcpName: string, toolName: string) => void;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Badge
        variant={disabled ? "secondary" : "default"}
        className={`cursor-pointer transition-all duration-200 ${
          disabled
            ? "opacity-50 line-through bg-muted text-muted-foreground hover:opacity-70"
            : "hover:bg-primary/80"
        }`}
        onClick={() => onToggle(serverId, tool.name)}
      >
        {tool.name}
      </Badge>
    </TooltipTrigger>
    {tool.description && (
      <TooltipContent
        side="bottom"
        className="max-w-xs bg-popover border border-border text-popover-foreground shadow-lg rounded-md px-3 py-2"
        sideOffset={5}
      >
        <p className="text-sm text-foreground">{tool.description}</p>
      </TooltipContent>
    )}
  </Tooltip>
);

const McpServerItem = ({
  serverId,
  config,
  isSelected,
  isPredefined,
  tools,
  isLoading,
  disabledTools,
  onToggleServer,
  onToggleTool,
}: {
  serverId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  isSelected: boolean;
  isPredefined: boolean;
  tools: ToolDefinition[];
  isLoading: boolean;
  disabledTools: DisabledTool[];
  onToggleServer: (serverId: string, checked: boolean) => void;
  onToggleTool: (mcpName: string, toolName: string) => void;
}) => {
  const allToolsDisabled =
    isPredefined &&
    tools.length > 0 &&
    tools.every((tool) =>
      disabledTools.some(
        (dt) => dt.mcpName === serverId && dt.toolName === tool.name,
      ),
    );

  const isToolDisabled = (toolName: string) =>
    disabledTools.some(
      (dt) => dt.mcpName === serverId && dt.toolName === toolName,
    );

  return (
    <div className="border border-border rounded-lg">
      <div className="flex items-center space-x-3 p-4">
        <Checkbox
          id={`mcp-server-${serverId}`}
          checked={isSelected}
          disabled={isPredefined}
          onCheckedChange={(checked) =>
            onToggleServer(serverId, checked === true)
          }
        />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p
              className={`font-medium text-sm truncate ${
                isPredefined && allToolsDisabled
                  ? "text-muted-foreground"
                  : "text-foreground"
              }`}
            >
              {config.name || serverId}
              {isPredefined && allToolsDisabled && (
                <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">
                  (All tools disabled)
                </span>
              )}
            </p>
            {config.description && (
              <p className="text-xs text-muted-foreground truncate">
                {config.description}
              </p>
            )}
          </div>
        </div>
        {isLoading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
      {isSelected && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          {isLoading ? (
            <div className="text-xs text-muted-foreground">
              Loading tools...
            </div>
          ) : tools.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No tools available
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {isPredefined
                  ? "Click tools to disable them (all enabled by default):"
                  : "Click tools to disable them (enabled by default):"}
              </p>
              <div className="flex flex-wrap gap-2">
                {tools.map((tool) => (
                  <ToolBadge
                    key={tool.name}
                    tool={tool}
                    serverId={serverId}
                    disabled={isToolDisabled(tool.name)}
                    onToggle={onToggleTool}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AgentListItem = ({
  agent,
  enabledToolsCount,
  isLast,
  onEdit,
  onDelete,
}: {
  agent: Agent;
  enabledToolsCount: number;
  isLast: boolean;
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
}) => {
  // Portraits live on the Member, not the Agent — this row renders the same
  // identity as every channel does.
  const member = useMember(memberIdForAgent(agent.id));
  const selectedServerCount = agent.selectedMCPs?.length || 0;

  return (
    <div
      className={`flex items-center justify-between py-4 ${
        !isLast ? "border-b border-border" : ""
      }`}
    >
      <div className="flex items-center gap-4">
        <MemberAvatar
          member={member}
          isHuman={false}
          className="h-10 w-10 text-sm"
          fallback={<Bot className="h-5 w-5 text-primary" />}
        />
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-foreground">{agent.name}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{agent.description}</p>
          <div className="flex items-center gap-3 mt-1">
            {selectedServerCount > 0 && (
              <div className="flex items-center gap-1">
                <Server className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {selectedServerCount} server
                  {selectedServerCount !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            {enabledToolsCount > 0 && (
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {enabledToolsCount} tool
                  {enabledToolsCount !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(agent)}
          className="h-8 w-8 p-0"
          aria-label={`Configure ${agent.name}`}
          title="Configure"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(agent)}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
          aria-label={`Delete ${agent.name}`}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export function AgentsSettingsPage({
  onNavigateToMcp,
}: AgentsSettingsPageProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedMcpServers, setSelectedMcpServers] = useState<string[]>([]);
  const [disabledTools, setDisabledTools] = useState<DisabledTool[]>([]);
  const [mcpServerTools, setMcpServerTools] = useState<
    Record<string, ToolDefinition[]>
  >({});
  const [loadingMcpTools, setLoadingMcpTools] = useState<
    Record<string, boolean>
  >({});
  const [agentForm, setAgentForm] = useState<AgentFormData>(EMPTY_AGENT_FORM);

  const {
    availableAgents,
    fetchAgents,
    createAgent,
    updateAgent,
    deleteAgent,
  } = useAgentStore();

  const { mcpServerConfigs, fetchMcpConfigurations, getMcpServerTools } =
    useMcpStore();

  const channels = useChannels();

  useEffect(() => {
    fetchAgents();
    fetchMcpConfigurations();
  }, [fetchAgents, fetchMcpConfigurations]);

  useEffect(() => {
    if (mcpServerConfigs?.mcpServers) {
      Object.keys(mcpServerConfigs.mcpServers).forEach((serverId) => {
        if (!mcpServerTools[serverId] && !loadingMcpTools[serverId]) {
          fetchMcpServerTools(serverId);
        }
      });
    }
  }, [mcpServerConfigs]);

  const fetchMcpServerTools = async (serverId: string) => {
    setLoadingMcpTools((prev) => ({ ...prev, [serverId]: true }));
    try {
      const tools = await getMcpServerTools(serverId);
      setMcpServerTools((prev) => ({ ...prev, [serverId]: tools }));
    } catch (err) {
      console.error(`Error fetching tools for MCP ${serverId}:`, err);
    } finally {
      setLoadingMcpTools((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  const resetCreateForm = () => {
    setSelectedTemplate(null);
    setSelectedMcpServers([]);
    setDisabledTools([]);
    setAgentForm(EMPTY_AGENT_FORM);
    setEditingAgent(null);
  };

  const handleCreateAgent = () => {
    resetCreateForm();
    setIsCreateDialogOpen(true);
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = AGENT_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setAgentForm({
        ...EMPTY_AGENT_FORM,
        name: template.name,
        description: template.description,
        systemPrompt: template.systemPrompt,
      });
      setDisabledTools([]);
      setEditingAgent(null);
    }
  };

  const handleCustomAgentSelect = () => {
    setSelectedTemplate("custom");
    setAgentForm(EMPTY_AGENT_FORM);
    setSelectedMcpServers([]);
    setDisabledTools([]);
    setEditingAgent(null);
  };

  const handleSaveAgent = async () => {
    if (!agentForm.name.trim()) {
      toast.error("Please provide a name for the agent");
      return;
    }

    try {
      const agentData = {
        name: agentForm.name.trim(),
        description: agentForm.description.trim() || agentForm.name.trim(),
        systemPrompt: agentForm.systemPrompt.trim(),
        selectedMCPs: selectedMcpServers,
        providerId: agentForm.providerId || undefined,
        modelId: agentForm.modelId || undefined,
        predefined: false,
        disableToolReferences: disabledTools.map((tool) => ({
          mcpName: tool.mcpName,
          toolName: tool.toolName,
          reason: "Manually disabled",
        })),
      } as Partial<Agent>;

      const created = await createAgent(agentData as Agent);
      if (agentForm.avatar) {
        await updateMemberProfile(memberIdForAgent(created.id), {
          avatar: agentForm.avatar,
        });
      }
      toast.success("Agent created successfully");
      setIsCreateDialogOpen(false);
    } catch (err) {
      toast.error(
        `Failed to create agent: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  const handleEditAgent = async (agent: Agent) => {
    setEditingAgent(agent);
    const member = await getMember(memberIdForAgent(agent.id));
    setAgentForm({
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt || "",
      providerId: agent.providerId ?? "",
      modelId: agent.modelId ?? "",
      avatar: member?.avatar ?? null,
    });
    setSelectedMcpServers(agent.selectedMCPs || []);
    setDisabledTools(
      agent.disableToolReferences?.map((ref) => ({
        mcpName: ref.mcpName,
        toolName: ref.toolName,
      })) || [],
    );
    setIsEditDialogOpen(true);
  };

  const handleUpdateAgent = async () => {
    if (!editingAgent || !agentForm.name.trim()) {
      toast.error("Please provide a valid name");
      return;
    }

    try {
      const finalSelectedMCPs =
        editingAgent.predefined && mcpServerConfigs?.mcpServers
          ? Object.keys(mcpServerConfigs.mcpServers)
          : selectedMcpServers;

      const updatedAgent: Agent = {
        ...editingAgent,
        name: agentForm.name.trim(),
        description: agentForm.description.trim() || agentForm.name.trim(),
        systemPrompt: agentForm.systemPrompt.trim(),
        selectedMCPs: finalSelectedMCPs,
        providerId: agentForm.providerId || undefined,
        modelId: agentForm.modelId || undefined,
        disableToolReferences: disabledTools.map((tool) => ({
          mcpName: tool.mcpName,
          toolName: tool.toolName,
          reason: "Manually disabled",
        })),
      };

      await updateAgent(updatedAgent);
      // `updateAgent` syncs the member's name; the portrait is only ours.
      await updateMemberProfile(memberIdForAgent(editingAgent.id), {
        avatar: agentForm.avatar,
      });
      toast.success("Agent updated successfully");
      setIsEditDialogOpen(false);
    } catch (err) {
      toast.error(
        `Failed to update agent: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  const confirmDeleteAgent = async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    try {
      const success = await deleteAgent(target.id);
      if (success) {
        toast.success(`Agent "${target.name}" deleted successfully`);
      } else {
        throw new Error("Failed to delete agent");
      }
    } catch (err) {
      toast.error(
        `Failed to delete agent: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  const handleMcpServerToggle = (serverId: string, checked: boolean) => {
    if (editingAgent?.predefined && !checked) {
      return;
    }

    setSelectedMcpServers((prev) => {
      if (checked) {
        return [...prev, serverId];
      } else {
        setDisabledTools((prevDisabled) =>
          prevDisabled.filter((tool) => tool.mcpName !== serverId),
        );
        return prev.filter((id) => id !== serverId);
      }
    });
  };

  const handleToolToggle = (mcpName: string, toolName: string) => {
    setDisabledTools((prev) => {
      const isCurrentlyDisabled = prev.some(
        (tool) => tool.mcpName === mcpName && tool.toolName === toolName,
      );

      if (isCurrentlyDisabled) {
        return prev.filter(
          (tool) => !(tool.mcpName === mcpName && tool.toolName === toolName),
        );
      } else {
        return [...prev, { mcpName, toolName }];
      }
    });
  };

  const getEnabledToolsCount = (agent: Agent) => {
    if (!agent.selectedMCPs || agent.selectedMCPs.length === 0) return 0;

    let totalTools = 0;
    let disabledCount = 0;

    agent.selectedMCPs.forEach((serverId) => {
      const tools = mcpServerTools[serverId] || [];
      totalTools += tools.length;
      disabledCount += (agent.disableToolReferences || []).filter(
        (ref) => ref.mcpName === serverId,
      ).length;
    });

    return Math.max(0, totalTools - disabledCount);
  };

  const mcpServerCount = mcpServerConfigs?.mcpServers
    ? Object.keys(mcpServerConfigs.mcpServers).length
    : 0;
  const availableMcpServers = mcpServerConfigs?.mcpServers
    ? Object.entries(mcpServerConfigs.mcpServers)
    : [];

  useEffect(() => {
    if (availableMcpServers.length > 0) {
      if (
        isCreateDialogOpen &&
        selectedTemplate &&
        selectedTemplate !== "custom" &&
        selectedMcpServers.length === 0
      ) {
        const allMcpServerIds = availableMcpServers.map(
          ([serverId]) => serverId,
        );
        setSelectedMcpServers(allMcpServerIds);
      }

      if (
        isEditDialogOpen &&
        editingAgent?.predefined &&
        availableMcpServers.length > 0
      ) {
        const allMcpServerIds = availableMcpServers.map(
          ([serverId]) => serverId,
        );
        setSelectedMcpServers(allMcpServerIds);
      }
    }
  }, [
    availableMcpServers.length,
    selectedTemplate,
    editingAgent?.predefined,
    isCreateDialogOpen,
    isEditDialogOpen,
  ]);

  const renderMcpConfiguration = () => {
    if (availableMcpServers.length === 0) {
      return (
        <div className="p-4 border border-border rounded-lg bg-muted/20">
          <p className="text-sm text-muted-foreground mb-3">
            No MCP servers configured
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateToMcp}
            className="flex items-center gap-2"
          >
            <Server className="h-4 w-4" />
            Setup MCP Servers
          </Button>
        </div>
      );
    }

    const isPredefinedAgent =
      (isEditDialogOpen && editingAgent?.predefined) || false;

    return (
      <div className="space-y-4">
        {isPredefinedAgent ? (
          <div className="bg-muted border-border rounded-lg border p-3">
            <p className="text-foreground mb-1 text-sm font-medium">
              Predefined Agent Configuration
            </p>
            <p className="text-muted-foreground text-xs">
              All MCP servers are enabled by default. To disable a server, turn
              off all its tools below.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select MCP servers and configure which tools to enable/disable:
          </p>
        )}
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {availableMcpServers.map(([serverId, config]) => (
            <McpServerItem
              key={serverId}
              serverId={serverId}
              config={config}
              isSelected={selectedMcpServers.includes(serverId)}
              isPredefined={isPredefinedAgent}
              tools={mcpServerTools[serverId] || []}
              isLoading={loadingMcpTools[serverId]}
              disabledTools={disabledTools}
              onToggleServer={handleMcpServerToggle}
              onToggleTool={handleToolToggle}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={100}>
      <div className="p-6">
        <div className="space-y-8">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">
                Agents
              </h1>
              <p className="text-muted-foreground">
                Create and manage AI agents for different tasks
              </p>
            </div>
            <Button
              onClick={handleCreateAgent}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New Agent
            </Button>
          </div>

          {mcpServerCount === 0 && (
            <div className="p-4 bg-muted/30 border border-border rounded-lg">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Server className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-foreground">
                      Connect Tools First
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Add MCP servers to give your agents powerful capabilities
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={onNavigateToMcp}
                  className="flex items-center gap-2"
                >
                  <Server className="h-4 w-4" />
                  Setup MCP Servers
                </Button>
              </div>
            </div>
          )}

          {availableAgents.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Bot className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">
                No Agents Yet
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Create your first AI agent to get started
              </p>
              <Button onClick={handleCreateAgent}>
                <Plus className="h-4 w-4 mr-2 text-primary-foreground" />
                Create Agent
              </Button>
            </div>
          ) : (
            <div className="space-y-0">
              {availableAgents.map((agent, index) => (
                <AgentListItem
                  key={agent.id}
                  agent={agent}
                  enabledToolsCount={getEnabledToolsCount(agent)}
                  isLast={index === availableAgents.length - 1}
                  onEdit={(target) => void handleEditAgent(target)}
                  onDelete={setPendingDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            resetCreateForm();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Create New Agent
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {!selectedTemplate && selectedTemplate !== "custom" && (
              <div>
                <h3 className="font-medium mb-4 text-foreground">
                  Choose a Template
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {AGENT_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateSelect(template.id)}
                      className="p-4 border border-border rounded-lg hover:border-primary/30 hover:bg-muted/20 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-primary">{template.icon}</div>
                        <h4 className="font-medium text-foreground">
                          {template.name}
                        </h4>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {template.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(selectedTemplate || selectedTemplate === "custom") && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-foreground">Agent Details</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTemplate(null)}
                    className="text-foreground"
                  >
                    {selectedTemplate === "custom"
                      ? "Back to Templates"
                      : "Change Template"}
                  </Button>
                </div>

                <AgentFormFields
                  form={agentForm}
                  onChange={setAgentForm}
                  idPrefix=""
                />

                <div className="space-y-3">
                  <Label className="text-foreground">MCP Configuration</Label>
                  {renderMcpConfiguration()}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              className="text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedTemplate && selectedTemplate !== "custom") {
                  handleCustomAgentSelect();
                } else {
                  handleSaveAgent();
                }
              }}
              disabled={!!selectedTemplate && !agentForm.name.trim()}
              className="text-primary-foreground"
            >
              Create Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Agent</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <AgentFormFields
              form={agentForm}
              onChange={setAgentForm}
              idPrefix="edit-"
            />

            <div className="space-y-3">
              <Label className="text-foreground">MCP Configuration</Label>
              {renderMcpConfiguration()}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              className="text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateAgent}
              disabled={!agentForm.name.trim()}
            >
              Update Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.name ?? ""}?`}
        description={
          pendingDelete
            ? describeAgentRemoval(
                pendingDelete.name,
                memberIdForAgent(pendingDelete.id),
                channels ?? [],
              )
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => void confirmDeleteAgent()}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      />
    </TooltipProvider>
  );
}
