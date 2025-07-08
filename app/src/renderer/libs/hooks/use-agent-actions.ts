import { getApiBaseUrl } from "@/renderer/libs/env";
import type { Agent } from "@/renderer/libs/stores/agent-store";
import { useAgentStore } from "@/renderer/libs/stores/agent-store";
import { useMcpStore } from "@/renderer/libs/stores/mcp-store";
import { useState } from "react";
import { toast } from "sonner";
import type {
  AgentFormData,
  MarketAgent,
  MarketAgentApiResponse,
} from "../../components/settings/pages/agent-market/types";

export function useAgentActions() {
  const [installing, setInstalling] = useState<Set<string>>(new Set());

  const { fetchAgents, deleteAgent } = useAgentStore();
  const { handleManualInstallMcp, refreshAll: refreshMcpData } = useMcpStore();

  // Handle agent deletion
  const handleDeleteAgent = async (
    agent: MarketAgent,
    availableAgents: Agent[],
  ) => {
    const installedAgent = availableAgents.find(
      (userAgent: Agent) => userAgent.name === agent.name,
    );

    if (!installedAgent) {
      toast.error("Agent not found in your local agents");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete "${agent.name}"?`)) {
      return;
    }

    try {
      const success = await deleteAgent(installedAgent.id);
      if (success) {
        toast.success(`Agent "${agent.name}" deleted successfully`);
        // Refresh agents list to update available agents
        await fetchAgents();
      } else {
        throw new Error("Failed to delete agent");
      }
    } catch (error) {
      console.error(`Error deleting ${agent.name}:`, error);
      toast.error(
        `Failed to delete agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Handle agent installation
  const handleInstallAgent = async (agent: MarketAgent) => {
    // Check if already installing
    if (installing.has(agent.id)) {
      return;
    }

    setInstalling((prev) => new Set(prev).add(agent.id));

    try {
      // First, get the complete agent details from the market API
      const response = await fetch(
        `${getApiBaseUrl()}/agent-market/${agent.id}`,
        {
          credentials: "include",
        },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch agent details from market");
      }

      const marketAgentData: MarketAgentApiResponse = await response.json();

      // Install MCP configurations if they exist
      if (marketAgentData.mcpInstallations) {
        try {
          // Parse mcpInstallations if it's a string
          let mcpInstallations = marketAgentData.mcpInstallations;
          if (typeof mcpInstallations === "string") {
            mcpInstallations = JSON.parse(mcpInstallations);
          }

          console.log(`🔍 Parsed MCP installations:`, mcpInstallations);

          // Check if there are any MCP servers to install
          if (
            typeof mcpInstallations === "object" &&
            mcpInstallations &&
            Object.keys(mcpInstallations).length > 0
          ) {
            // Use the MCP store's handleManualInstallMcp method like mcp-page.tsx
            const mcpConfigJson = JSON.stringify({
              mcpServers: mcpInstallations,
            });

            await handleManualInstallMcp(mcpConfigJson);
            await refreshMcpData();
          } else {
            console.log(`ℹ️ No MCP servers to install for "${agent.name}"`);
          }
        } catch (mcpError) {
          console.error(
            `⚠️ Failed to install MCP configurations for "${agent.name}":`,
            mcpError,
          );
          // Don't fail the entire installation if MCP installation fails
          toast.error(
            `Agent installed but MCP configuration failed: ${mcpError instanceof Error ? mcpError.message : String(mcpError)}`,
          );
        }
      } else {
        console.log(`ℹ️ No MCP configurations to install for "${agent.name}"`);
      }
      // Refresh the local agents list to see the newly installed agent
      await fetchAgents();

      toast.success(`${agent.name} installed successfully!`);
    } catch (error) {
      console.error(`Error installing ${agent.name}:`, error);
      toast.error(
        `Failed to install ${agent.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setInstalling((prev) => {
        const newSet = new Set(prev);
        newSet.delete(agent.id);
        return newSet;
      });
    }
  };

  // Handle create new agent
  const handleCreateAgent = async (
    agentForm: AgentFormData,
    onSuccess: () => void,
  ) => {
    if (!agentForm.name.trim()) {
      toast.error("Please provide a name for the agent");
      return;
    }

    try {
      const agentJson = {
        name: agentForm.name.trim(),
        description: agentForm.description.trim(),
        systemPrompt: agentForm.systemPrompt.trim(),
        predefined: false,
        selectedMCPs: [],
        disableToolReferences: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const data = {
        agentJson: JSON.stringify(agentJson),
        mcpInstallations: JSON.stringify({}),
      };

      const response = await fetch(`${getApiBaseUrl()}/agent-market`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Failed to create agent");
      }

      onSuccess();
    } catch (error) {
      console.error("Error creating agent:", error);
      toast.error(
        `Failed to publish agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Handle upload existing agent
  const handleUploadExistingAgent = async (
    agent: Agent,
    onSuccess: () => void,
  ) => {
    try {
      const agentJson = {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        predefined: false,
        selectedMCPs: agent.selectedMCPs || [],
        disableToolReferences: agent.disableToolReferences || [],
        createdAt: agent.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Generate MCP installations based on agent's selected MCPs
      const mcpInstallations: Record<string, unknown> = {};

      if (agent.selectedMCPs) {
        agent.selectedMCPs.forEach((mcpName) => {
          // Create a simple MCP configuration for each selected MCP
          mcpInstallations[mcpName] = {
            command: "npx",
            args: ["-y", `@modelcontextprotocol/server-${mcpName}`],
            env: {},
          };
        });
      }

      const data = {
        agentJson: JSON.stringify(agentJson),
        mcpInstallations: JSON.stringify(mcpInstallations),
      };

      const response = await fetch(`${getApiBaseUrl()}/agent-market`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Failed to upload agent");
      }

      toast.success(`${agent.name} uploaded to market successfully!`);
      onSuccess();
    } catch (error) {
      console.error("Error uploading existing agent:", error);
      toast.error(
        `Failed to upload agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return {
    installing,
    handleDeleteAgent,
    handleInstallAgent,
    handleCreateAgent,
    handleUploadExistingAgent,
  };
}
