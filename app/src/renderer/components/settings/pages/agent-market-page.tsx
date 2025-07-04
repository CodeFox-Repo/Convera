import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/renderer/components/ui/alert-dialog";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/renderer/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/renderer/components/ui/dialog";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import { Textarea } from "@/renderer/components/ui/textarea";
import type { Agent } from "@/renderer/libs/stores/agent-store";
import { useAgentStore } from "@/renderer/libs/stores/agent-store";
import { useMcpStore } from "@/renderer/libs/stores/mcp-store";
import { Copy, Download, Loader2, Plus, Search } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

// Import our new components and hooks
import { useAgentActions } from "../../../libs/hooks/use-agent-actions";
import { useMarketAgents } from "../../../libs/hooks/use-market-agents";
import { AgentList } from "../../agent-list";
import { CreateAgentDialog } from "../../create-agent-dialog";
import type {
  AgentFormData,
  CreateMode,
  MarketAgent,
  MCPServerConfig,
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
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent
          className="flex h-[95vh] w-[96vw] max-w-[96vw] flex-col"
          style={{
            width: "96vw !important",
            maxWidth: "96vw !important",
            minWidth: "96vw",
          }}
        >
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-xl font-semibold text-foreground">
              Agent Details
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              View detailed information about this agent
            </DialogDescription>
          </DialogHeader>

          {selectedAgentForDetail && (
            <div className="flex flex-1 gap-6 overflow-hidden px-2">
              {/* Left Panel - Agent Form */}
              <div className="flex w-2/5 min-w-0 flex-col pr-2">
                <div className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto">
                  <div className="space-y-2">
                    <Label htmlFor="detail-name" className="text-foreground">
                      Name
                    </Label>
                    <Input
                      id="detail-name"
                      value={selectedAgentForDetail.name}
                      readOnly
                      className="bg-background text-foreground border-border/30"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="detail-description"
                      className="text-foreground"
                    >
                      Description
                    </Label>
                    <Textarea
                      id="detail-description"
                      value={
                        selectedAgentForDetail.description ||
                        "No description provided"
                      }
                      readOnly
                      rows={3}
                      className="bg-background text-foreground border-border/30 resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="detail-system-prompt"
                      className="text-foreground"
                    >
                      System Prompt
                    </Label>
                    <Textarea
                      id="detail-system-prompt"
                      value={
                        selectedAgentForDetail.systemPrompt ||
                        "No system prompt provided"
                      }
                      readOnly
                      rows={8}
                      className="bg-background text-foreground border-border/30 font-mono text-sm resize-none"
                    />
                  </div>

                  {/* Selected MCPs Display */}
                  <div className="space-y-2">
                    <Label className="text-foreground">Selected MCPs</Label>
                    <div className="min-w-0 overflow-hidden rounded border border-border/30 p-3 bg-muted/20">
                      {!selectedAgentForDetail.selectedMCPs ||
                      selectedAgentForDetail.selectedMCPs.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                          No MCPs selected
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {selectedAgentForDetail.selectedMCPs.map(
                            (mcpName) => (
                              <Badge
                                key={mcpName}
                                variant="default"
                                className="flex items-center gap-1"
                              >
                                <span>{mcpName}</span>
                              </Badge>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Disabled Tools */}
                  <div className="space-y-2">
                    <Label className="text-foreground">Disabled Tools</Label>
                    <div className="min-w-0 overflow-hidden rounded border border-border/30 p-3 bg-muted/20">
                      {!selectedAgentForDetail.disableToolReferences ||
                      selectedAgentForDetail.disableToolReferences.length ===
                        0 ? (
                        <p className="text-muted-foreground text-sm">
                          No tools disabled
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {selectedAgentForDetail.disableToolReferences.map(
                            (tool, index) => (
                              <Badge
                                key={index}
                                variant="secondary"
                                className="text-xs"
                              >
                                {tool}
                              </Badge>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Keywords */}
                  {selectedAgentForDetail.keywords &&
                    selectedAgentForDetail.keywords.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-foreground">Keywords</Label>
                        <div className="flex flex-wrap gap-2">
                          {selectedAgentForDetail.keywords.map((keyword) => (
                            <Badge
                              key={keyword}
                              variant="outline"
                              className="text-sm"
                            >
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Author Information */}
                  {selectedAgentForDetail.author && (
                    <div className="space-y-2">
                      <Label className="text-foreground">
                        Author Information
                      </Label>
                      <div className="p-3 bg-muted/20 border border-border/30 rounded-md space-y-1 text-sm">
                        <p className="text-foreground">
                          <strong>Name:</strong>{" "}
                          {selectedAgentForDetail.author.name}
                        </p>
                        {selectedAgentForDetail.author.url && (
                          <p className="text-foreground">
                            <strong>URL:</strong>{" "}
                            <a
                              href={selectedAgentForDetail.author.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {selectedAgentForDetail.author.url}
                            </a>
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="space-y-2">
                    <Label className="text-foreground">Metadata</Label>
                    <div className="p-3 bg-muted/20 border border-border/30 rounded-md space-y-1 text-sm text-foreground">
                      <p>
                        <strong>Agent ID:</strong> {selectedAgentForDetail.id}
                      </p>
                      <p>
                        <strong>Version:</strong>{" "}
                        {selectedAgentForDetail.version || "1.0.0"}
                      </p>
                      <p>
                        <strong>Created:</strong>{" "}
                        {new Date(
                          selectedAgentForDetail.createdAt,
                        ).toLocaleString()}
                      </p>
                      <p>
                        <strong>Updated:</strong>{" "}
                        {new Date(
                          selectedAgentForDetail.updatedAt,
                        ).toLocaleString()}
                      </p>
                      {selectedAgentForDetail.iconUrl && (
                        <p>
                          <strong>Icon URL:</strong>{" "}
                          <a
                            href={selectedAgentForDetail.iconUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline break-all"
                          >
                            {selectedAgentForDetail.iconUrl}
                          </a>
                        </p>
                      )}
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
                        <CardTitle className="text-lg">
                          MCP Installation Configuration
                        </CardTitle>
                        <CardDescription>
                          JSON configuration for MCP servers that will be
                          installed
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // Create a mock MCP installation config based on selected MCPs
                            const mcpConfig = {
                              mcpServers:
                                selectedAgentForDetail.selectedMCPs?.reduce(
                                  (acc, mcpName) => {
                                    acc[mcpName] = {
                                      command: "npx",
                                      args: [
                                        "-y",
                                        `@modelcontextprotocol/server-${mcpName}`,
                                      ],
                                      env: {
                                        DEBUG: "true",
                                      },
                                    };
                                    return acc;
                                  },
                                  {} as Record<string, MCPServerConfig>,
                                ) || {},
                            };
                            navigator.clipboard.writeText(
                              JSON.stringify(mcpConfig, null, 2),
                            );
                            toast.success(
                              "MCP configuration copied to clipboard!",
                            );
                          }}
                          className="text-foreground border-border hover:bg-muted hover:text-foreground"
                        >
                          <Copy className="mr-2 h-4 w-4" /> Copy
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col pb-4">
                    <div className="flex flex-1 flex-col space-y-2">
                      <Textarea
                        value={JSON.stringify(
                          {
                            mcpServers:
                              selectedAgentForDetail.selectedMCPs?.reduce(
                                (acc, mcpName) => {
                                  acc[mcpName] = {
                                    command: "npx",
                                    args: [
                                      "-y",
                                      `@modelcontextprotocol/server-${mcpName}`,
                                    ],
                                    env: {
                                      DEBUG: "true",
                                    },
                                  };
                                  return acc;
                                },
                                {} as Record<string, MCPServerConfig>,
                              ) || {},
                          },
                          null,
                          2,
                        )}
                        readOnly
                        placeholder='{\n  "mcpServers": {\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem"],\n      "env": {\n        "DEBUG": "true"\n      }\n    }\n  }\n}'
                        className="flex-1 resize-none font-mono text-sm bg-background text-foreground border-border/30"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsDetailDialogOpen(false)}
              className="text-foreground border-border hover:bg-muted hover:text-foreground"
            >
              Close
            </Button>
            {selectedAgentForDetail &&
              !installedAgents.has(selectedAgentForDetail.id) && (
                <Button
                  onClick={() => {
                    if (selectedAgentForDetail) {
                      handleInstallAgent(selectedAgentForDetail);
                      setIsDetailDialogOpen(false);
                    }
                  }}
                  disabled={installing.has(selectedAgentForDetail.id)}
                  className="text-primary-foreground"
                >
                  {installing.has(selectedAgentForDetail.id) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Install Agent
                    </>
                  )}
                </Button>
              )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Confirmation Dialog */}
      <AlertDialog
        open={showSaveConfirmation}
        onOpenChange={setShowSaveConfirmation}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Save Draft?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              You have unsaved changes. Would you like to save your progress as
              a draft before closing?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => handleSaveConfirmation(false)}
              className="text-foreground border-border hover:bg-muted hover:text-foreground"
            >
              Don&apos;t Save
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleSaveConfirmation(true)}
              className="text-primary-foreground"
            >
              Save Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
