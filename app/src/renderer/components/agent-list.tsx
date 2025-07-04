import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent } from "@/renderer/components/ui/card";
import {
  Bot,
  CheckCircle,
  Download,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import React from "react";
import type { MarketAgent } from "./settings/pages/agent-market/types";

interface AgentListProps {
  agents: MarketAgent[];
  loading: boolean;
  installedAgents: Set<string>;
  installing: Set<string>;
  searchQuery: string;
  onViewAgent: (agent: MarketAgent) => void;
  onInstallAgent: (agent: MarketAgent) => void;
  onDeleteAgent: (agent: MarketAgent) => void;
}

export function AgentList({
  agents,
  loading,
  installedAgents,
  installing,
  searchQuery,
  onViewAgent,
  onInstallAgent,
  onDeleteAgent,
}: AgentListProps) {
  const getAgentIcon = (agent: MarketAgent) => {
    if (agent.iconUrl) {
      return (
        <img
          src={agent.iconUrl}
          alt={agent.name}
          className="w-10 h-10 rounded-lg"
        />
      );
    }
    return (
      <Bot className="w-10 h-10 p-2 bg-blue-100 text-blue-600 rounded-lg" />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading agents...</span>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Bot className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No agents available</h3>
          <p className="text-muted-foreground">
            {searchQuery
              ? "Try adjusting your search"
              : "Check back later for new agents"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {agents.map((agent) => (
        <Card key={agent.id} className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                {getAgentIcon(agent)}
                <div>
                  <h3 className="font-semibold text-foreground">
                    {agent.name}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {agent.description}
                  </p>
                </div>
              </div>

              {agent.selectedMCPs && agent.selectedMCPs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {agent.selectedMCPs.slice(0, 5).map((mcp) => (
                    <Badge key={mcp} variant="secondary" className="text-xs">
                      {mcp}
                    </Badge>
                  ))}
                  {agent.selectedMCPs.length > 5 && (
                    <Badge variant="outline" className="text-xs">
                      +{agent.selectedMCPs.length - 5} more
                    </Badge>
                  )}
                </div>
              )}

              <div className="text-muted-foreground mt-2 text-xs">
                Version: {agent.version || "1.0.0"}
                {agent.author?.name && ` • By: ${agent.author.name}`}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewAgent(agent)}
                className="text-foreground border-border hover:bg-muted hover:text-foreground"
              >
                <Search className="w-4 h-4 mr-1" />
                View
              </Button>
              {installedAgents.has(agent.id) ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled
                    className="bg-muted text-muted-foreground"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Installed
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDeleteAgent(agent)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => onInstallAgent(agent)}
                  disabled={installing.has(agent.id)}
                >
                  {installing.has(agent.id) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Install
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
