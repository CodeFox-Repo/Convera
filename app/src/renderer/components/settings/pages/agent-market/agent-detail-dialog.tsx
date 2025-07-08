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
import { useMcpStore } from "@/renderer/libs/stores/mcp-store";
import type { MCPServerConfig } from "@/shared/types/mcp";
import { Copy, Download, Loader2 } from "lucide-react";
import React, { useEffect } from "react";
import { toast } from "sonner";
import type { MarketAgent } from "./types";

interface AgentDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agent: MarketAgent | null;
  installedAgents: Set<string>;
  installing: Set<string>;
  onInstallAgent: (agent: MarketAgent) => void;
}

export function AgentDetailDialog({
  isOpen,
  onClose,
  agent,
  installedAgents,
  installing,
  onInstallAgent,
}: AgentDetailDialogProps) {
  const { mcpServerConfigs, fetchMcpConfigurations } = useMcpStore();

  // Fetch real MCP configurations when dialog opens
  useEffect(() => {
    if (isOpen && !mcpServerConfigs) {
      fetchMcpConfigurations();
    }
  }, [isOpen, mcpServerConfigs, fetchMcpConfigurations]);

  const getRealMcpConfig = () => {
    if (!agent?.selectedMCPs || !mcpServerConfigs?.mcpServers) {
      return { mcpServers: {} };
    }

    // Filter real MCP configurations based on selected MCPs
    const realMcpServers: Record<string, MCPServerConfig> = {};

    agent.selectedMCPs.forEach((mcpName) => {
      const realConfig = mcpServerConfigs.mcpServers[mcpName];
      if (realConfig) {
        realMcpServers[mcpName] = realConfig;
      }
      // If no real config found, just skip it (don't add fallback)
    });

    return { mcpServers: realMcpServers };
  };

  const handleCopyMcpConfig = () => {
    if (!agent) return;

    const mcpConfig = getRealMcpConfig();
    navigator.clipboard.writeText(JSON.stringify(mcpConfig, null, 2));
    toast.success("MCP configuration copied to clipboard!");
  };

  const handleInstall = () => {
    if (agent) {
      onInstallAgent(agent);
      onClose();
    }
  };

  const mcpConfig = getRealMcpConfig();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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

        {agent && (
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
                    value={agent.name}
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
                    value={agent.description || "No description provided"}
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
                    value={agent.systemPrompt || "No system prompt provided"}
                    readOnly
                    rows={8}
                    className="bg-background text-foreground border-border/30 font-mono text-sm resize-none"
                  />
                </div>

                {/* Selected MCPs Display */}
                <div className="space-y-2">
                  <Label className="text-foreground">Selected MCPs</Label>
                  <div className="min-w-0 overflow-hidden rounded border border-border/30 p-3 bg-muted/20">
                    {!agent.selectedMCPs || agent.selectedMCPs.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        No MCPs selected
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {agent.selectedMCPs.map((mcpName) => {
                          const hasRealConfig =
                            mcpServerConfigs?.mcpServers?.[mcpName];
                          return (
                            <Badge
                              key={mcpName}
                              variant={hasRealConfig ? "default" : "secondary"}
                              className="flex items-center gap-1"
                            >
                              <span>{mcpName}</span>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Disabled Tools */}
                <div className="space-y-2">
                  <Label className="text-foreground">Disabled Tools</Label>
                  <div className="min-w-0 overflow-hidden rounded border border-border/30 p-3 bg-muted/20">
                    {!agent.disableToolReferences ||
                    agent.disableToolReferences.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        No tools disabled
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {agent.disableToolReferences.map((tool, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="text-xs"
                          >
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Keywords */}
                {agent.keywords && agent.keywords.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-foreground">Keywords</Label>
                    <div className="flex flex-wrap gap-2">
                      {agent.keywords.map((keyword) => (
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
                {agent.author && (
                  <div className="space-y-2">
                    <Label className="text-foreground">
                      Author Information
                    </Label>
                    <div className="p-3 bg-muted/20 border border-border/30 rounded-md space-y-1 text-sm">
                      <p className="text-foreground">
                        <strong>Name:</strong> {agent.author.name}
                      </p>
                      {agent.author.url && (
                        <p className="text-foreground">
                          <strong>URL:</strong>{" "}
                          <a
                            href={agent.author.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {agent.author.url}
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
                      <strong>Agent ID:</strong> {agent.id}
                    </p>
                    <p>
                      <strong>Version:</strong> {agent.version || "1.0.0"}
                    </p>
                    <p>
                      <strong>Created:</strong>{" "}
                      {new Date(agent.createdAt).toLocaleString()}
                    </p>
                    <p>
                      <strong>Updated:</strong>{" "}
                      {new Date(agent.updatedAt).toLocaleString()}
                    </p>
                    {agent.iconUrl && (
                      <p>
                        <strong>Icon URL:</strong>{" "}
                        <a
                          href={agent.iconUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline break-all"
                        >
                          {agent.iconUrl}
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
                        {mcpServerConfigs
                          ? "Only shows MCP servers that are actually configured in your system"
                          : "Loading MCP configurations from your system..."}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyMcpConfig}
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
                      value={JSON.stringify(mcpConfig, null, 2)}
                      readOnly
                      placeholder={
                        mcpServerConfigs
                          ? '{\n  "mcpServers": {\n    // Only MCP servers configured in your system will appear here\n  }\n}'
                          : '{\n  "mcpServers": {\n    // Loading...\n  }\n}'
                      }
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
            onClick={onClose}
            className="text-foreground border-border hover:bg-muted hover:text-foreground"
          >
            Close
          </Button>
          {agent && !installedAgents.has(agent.id) && (
            <Button
              onClick={handleInstall}
              disabled={installing.has(agent.id)}
              className="text-primary-foreground"
            >
              {installing.has(agent.id) ? (
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
  );
}
