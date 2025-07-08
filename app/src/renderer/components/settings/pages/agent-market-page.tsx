import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import type { Agent } from "@/renderer/libs/stores/agent-store";
import { useAgentStore } from "@/renderer/libs/stores/agent-store";
import { useMcpStore } from "@/renderer/libs/stores/mcp-store";
import { Plus, Search } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

// Import our new components and hooks
import { useAgentActions } from "../../../libs/hooks/use-agent-actions";
import { useMarketAgents } from "../../../libs/hooks/use-market-agents";
import { AgentList } from "../../agent-list";
import { CreateAgentDialog } from "../../create-agent-dialog";
import { AgentDetailDialog } from "./agent-market/agent-detail-dialog";
import { SaveConfirmationDialog } from "./agent-market/save-confirmation-dialog";
import type {
  AgentFormData,
  CreateMode,
  MarketAgent,
} from "./agent-market/types";

export function AgentMarketPage() {
  const [searchQuery, setSearchQuery] = useState("");

  // Create/Upload dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [selectedExistingAgent, setSelectedExistingAgent] =
    useState<Agent | null>(null);

  // Agent detail dialog states
  const [selectedAgentForDetail, setSelectedAgentForDetail] =
    useState<MarketAgent | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Save confirmation dialog state
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);

  // Create form states
  const [agentForm, setAgentForm] = useState<AgentFormData>({
    name: "",
    description: "",
    systemPrompt: "",
    keywords: "",
    version: "1.0.0",
    authorName: "",
    authorUrl: "",
  });

  const { availableAgents, fetchAgents } = useAgentStore();
  const { subscribeMcpChanges } = useMcpStore();

  // Use our custom hooks
  const {
    marketAgents,
    loadingMarketAgents,
    installedAgents,
    fetchMarketAgents,
  } = useMarketAgents(availableAgents);

  const {
    installing,
    handleDeleteAgent,
    handleInstallAgent,
    handleCreateAgent,
    handleUploadExistingAgent,
  } = useAgentActions();

  useEffect(() => {
    fetchAgents();
    fetchMarketAgents();

    // Subscribe to MCP data changes for real-time sync
    const unsubscribeMcp = subscribeMcpChanges();

    return () => {
      unsubscribeMcp();
    };
  }, [fetchAgents, subscribeMcpChanges, fetchMarketAgents]);

  // Draft management functions
  const resetForm = () => {
    setAgentForm({
      name: "",
      description: "",
      systemPrompt: "",
      keywords: "",
      version: "1.0.0",
      authorName: "",
      authorUrl: "",
    });
    setCreateMode(null);
    setSelectedExistingAgent(null);
  };

  const hasFormContent = () => {
    return (
      agentForm.name.trim() ||
      agentForm.description.trim() ||
      agentForm.systemPrompt.trim() ||
      agentForm.keywords.trim() ||
      agentForm.authorName.trim() ||
      agentForm.authorUrl.trim()
    );
  };

  const handleDialogClose = () => {
    if (createMode === "create" && hasFormContent()) {
      setShowSaveConfirmation(true);
    } else {
      setIsCreateDialogOpen(false);
      resetForm();
    }
  };

  const handleSaveConfirmation = (shouldSave: boolean) => {
    setShowSaveConfirmation(false);
    if (shouldSave) {
      const draftKey = "agent-market-draft";
      localStorage.setItem(draftKey, JSON.stringify(agentForm));
      toast.success("Draft saved successfully!");
    }
    setIsCreateDialogOpen(false);
    resetForm();
  };

  const loadDraft = () => {
    const draftKey = "agent-market-draft";
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const draftData = JSON.parse(savedDraft);
        setAgentForm(draftData);
        localStorage.removeItem(draftKey);
        toast.success("Draft loaded successfully!");
      } catch (error) {
        console.error("Failed to load draft:", error);
        toast.error("Failed to load draft");
      }
    }
  };

  const handleCreateAgentWithDraftCheck = () => {
    const draftKey = "agent-market-draft";
    const savedDraft = localStorage.getItem(draftKey);

    if (savedDraft) {
      if (
        window.confirm(
          "You have a saved draft. Would you like to continue with it?",
        )
      ) {
        loadDraft();
      } else {
        localStorage.removeItem(draftKey);
      }
    }

    setIsCreateDialogOpen(true);
  };

  // Wrapped action handlers
  const handleCreateAgentWrapper = () => {
    handleCreateAgent(agentForm, () => {
      setIsCreateDialogOpen(false);
      resetForm();
      fetchMarketAgents();
    });
  };

  const handleUploadExistingAgentWrapper = (agent: Agent) => {
    handleUploadExistingAgent(agent, () => {
      setIsCreateDialogOpen(false);
      setCreateMode(null);
      setSelectedExistingAgent(null);
      fetchMarketAgents();
    });
  };

  const handleDeleteAgentWrapper = (agent: MarketAgent) => {
    handleDeleteAgent(agent, availableAgents);
  };

  // Filter agents based on search
  const filteredAgents = marketAgents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.author?.name.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  return (
    <div className="flex flex-col space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agent Market</h1>
          <p className="text-muted-foreground">
            Discover and install pre-built AI agents for various tasks
          </p>
        </div>
        <Button onClick={handleCreateAgentWithDraftCheck}>
          <Plus className="w-4 h-4 mr-2" />
          Publish Agent
        </Button>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
            className="pl-10 text-foreground"
          />
        </div>
        {searchQuery && (
          <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
            Clear Search
          </Button>
        )}
      </div>

      {/* Available Agents Section */}
      <div>
        <h2 className="text-lg font-medium mb-4">
          Available Agents ({filteredAgents.length})
        </h2>
        <AgentList
          agents={filteredAgents}
          loading={loadingMarketAgents}
          installedAgents={installedAgents}
          installing={installing}
          searchQuery={searchQuery}
          onViewAgent={(agent) => {
            setSelectedAgentForDetail(agent);
            setIsDetailDialogOpen(true);
          }}
          onInstallAgent={handleInstallAgent}
          onDeleteAgent={handleDeleteAgentWrapper}
        />
      </div>

      {/* Create/Upload Dialog */}
      <CreateAgentDialog
        isOpen={isCreateDialogOpen}
        onClose={handleDialogClose}
        createMode={createMode}
        onSetCreateMode={setCreateMode}
        agentForm={agentForm}
        onUpdateAgentForm={setAgentForm}
        availableAgents={availableAgents}
        selectedExistingAgent={selectedExistingAgent}
        onSelectExistingAgent={setSelectedExistingAgent}
        onCreateAgent={handleCreateAgentWrapper}
        onUploadExistingAgent={handleUploadExistingAgentWrapper}
      />

      {/* Agent Detail Dialog */}
      <AgentDetailDialog
        isOpen={isDetailDialogOpen}
        onClose={() => setIsDetailDialogOpen(false)}
        agent={selectedAgentForDetail}
        installedAgents={installedAgents}
        installing={installing}
        onInstallAgent={handleInstallAgent}
      />

      {/* Save Confirmation Dialog */}
      <SaveConfirmationDialog
        isOpen={showSaveConfirmation}
        onClose={handleSaveConfirmation}
      />
    </div>
  );
}
