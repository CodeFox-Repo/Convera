import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent } from "@/renderer/components/ui/card";
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
import { Bot, CheckCircle, Globe, Plus } from "lucide-react";
import React from "react";
import type {
  AgentFormData,
  CreateMode,
} from "./settings/pages/agent-market/types";

interface CreateAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  createMode: CreateMode;
  onSetCreateMode: (mode: CreateMode) => void;
  agentForm: AgentFormData;
  onUpdateAgentForm: (form: AgentFormData) => void;
  availableAgents: Agent[];
  selectedExistingAgent: Agent | null;
  onSelectExistingAgent: (agent: Agent | null) => void;
  onCreateAgent: () => void;
  onUploadExistingAgent: (agent: Agent) => void;
}

export function CreateAgentDialog({
  isOpen,
  onClose,
  createMode,
  onSetCreateMode,
  agentForm,
  onUpdateAgentForm,
  availableAgents,
  selectedExistingAgent,
  onSelectExistingAgent,
  onCreateAgent,
  onUploadExistingAgent,
}: CreateAgentDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-foreground">
            Publish Agent to Market
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Share your agent with the community by publishing it to the
            marketplace.
          </DialogDescription>
        </DialogHeader>

        {!createMode ? (
          // Mode Selection
          <div className="grid grid-cols-2 gap-6 py-8">
            <Card
              className="cursor-pointer hover:border-primary hover:shadow-lg transition-all duration-200 border-border"
              onClick={() => onSetCreateMode("create")}
            >
              <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <Plus className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Create New Agent
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Create a new agent from scratch with a custom configuration
                </p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary hover:shadow-lg transition-all duration-200 border-border"
              onClick={() => onSetCreateMode("existing")}
            >
              <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <Bot className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Upload Existing Agent
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Select and upload one of your existing local agents
                </p>
              </CardContent>
            </Card>
          </div>
        ) : createMode === "create" ? (
          // Create Form
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label
                htmlFor="agent-name"
                className="text-sm font-medium text-foreground"
              >
                Agent Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="agent-name"
                value={agentForm.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onUpdateAgentForm({
                    ...agentForm,
                    name: e.target.value,
                  })
                }
                placeholder="e.g., Code Assistant"
                className="bg-background border-input text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="agent-description"
                className="text-sm font-medium text-foreground"
              >
                Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="agent-description"
                value={agentForm.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  onUpdateAgentForm({
                    ...agentForm,
                    description: e.target.value,
                  })
                }
                placeholder="Describe what your agent does and how it can help users..."
                rows={3}
                className="bg-background border-input text-foreground resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="agent-prompt"
                className="text-sm font-medium text-foreground"
              >
                System Prompt <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="agent-prompt"
                value={agentForm.systemPrompt}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  onUpdateAgentForm({
                    ...agentForm,
                    systemPrompt: e.target.value,
                  })
                }
                placeholder="You are a helpful AI assistant that specializes in..."
                rows={6}
                className="bg-background border-input text-foreground font-mono text-sm resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="agent-author"
                  className="text-sm font-medium text-foreground"
                >
                  Author Name
                </Label>
                <Input
                  id="agent-author"
                  value={agentForm.authorName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onUpdateAgentForm({
                      ...agentForm,
                      authorName: e.target.value,
                    })
                  }
                  placeholder="Your Name"
                  className="bg-background border-input text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="agent-version"
                  className="text-sm font-medium text-foreground"
                >
                  Version
                </Label>
                <Input
                  id="agent-version"
                  value={agentForm.version}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onUpdateAgentForm({
                      ...agentForm,
                      version: e.target.value,
                    })
                  }
                  placeholder="1.0.0"
                  className="bg-background border-input text-foreground"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="agent-keywords"
                className="text-sm font-medium text-foreground"
              >
                Keywords{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="agent-keywords"
                value={agentForm.keywords}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onUpdateAgentForm({
                    ...agentForm,
                    keywords: e.target.value,
                  })
                }
                placeholder="coding, productivity, automation"
                className="bg-background border-input text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Separate keywords with commas to help users discover your agent
              </p>
            </div>
          </div>
        ) : createMode === "existing" ? (
          // Existing Agents Selection
          <div className="space-y-6 py-6">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-foreground">
                Select an Existing Agent
              </h3>
              <p className="text-sm text-muted-foreground">
                Choose one of your existing agents to publish to the market
              </p>
            </div>

            {availableAgents.length === 0 ? (
              <div className="text-center py-12">
                <Bot className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h4 className="text-base font-medium text-foreground mb-2">
                  No agents available
                </h4>
                <p className="text-sm text-muted-foreground">
                  Create an agent first in the Agents section.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {availableAgents.map((agent: Agent) => (
                  <Card
                    key={agent.id}
                    className={`cursor-pointer transition-all duration-200 ${
                      selectedExistingAgent?.id === agent.id
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/50 hover:shadow-sm"
                    }`}
                    onClick={() => onSelectExistingAgent(agent)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start space-x-4">
                        <Bot className="w-10 h-10 p-2 bg-primary/10 text-primary rounded-lg flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-foreground truncate text-base">
                            {agent.name}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {agent.description || "No description provided"}
                          </p>
                          {agent.selectedMCPs &&
                            agent.selectedMCPs.length > 0 && (
                              <div className="flex items-center space-x-1 mt-3">
                                <Globe className="w-4 h-4 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                  {agent.selectedMCPs.length} MCP server
                                  {agent.selectedMCPs.length !== 1 ? "s" : ""}
                                </span>
                              </div>
                            )}
                        </div>
                        {selectedExistingAgent?.id === agent.id && (
                          <CheckCircle className="w-6 h-6 text-primary flex-shrink-0" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="flex flex-row justify-end space-x-2 pt-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="px-4 py-2 text-foreground border-border hover:bg-muted hover:text-foreground"
          >
            Cancel
          </Button>
          {createMode && (
            <Button
              variant="outline"
              onClick={() => onSetCreateMode(null)}
              className="px-4 py-2 text-foreground border-border hover:bg-muted hover:text-foreground"
            >
              Back
            </Button>
          )}
          {createMode === "create" && (
            <Button
              onClick={onCreateAgent}
              disabled={
                !agentForm.name ||
                !agentForm.description ||
                !agentForm.systemPrompt
              }
              className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Publish Agent
            </Button>
          )}
          {createMode === "existing" && (
            <Button
              onClick={() =>
                selectedExistingAgent &&
                onUploadExistingAgent(selectedExistingAgent)
              }
              disabled={!selectedExistingAgent}
              className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Upload Selected Agent
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
