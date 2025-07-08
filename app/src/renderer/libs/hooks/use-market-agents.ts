import { getApiBaseUrl } from "@/renderer/libs/env";
import type { Agent } from "@/renderer/libs/stores/agent-store";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  MarketAgent,
  MarketAgentApiResponse,
} from "../../components/settings/pages/agent-market/types";

export function useMarketAgents(availableAgents: Agent[]) {
  const [marketAgents, setMarketAgents] = useState<MarketAgent[]>([]);
  const [loadingMarketAgents, setLoadingMarketAgents] = useState(true);
  const [installedAgents, setInstalledAgents] = useState<Set<string>>(
    new Set(),
  );

  // Fetch market agents from API
  const fetchMarketAgents = useCallback(async () => {
    try {
      setLoadingMarketAgents(true);
      const response = await fetch(`${getApiBaseUrl()}/agent-market`);
      if (!response.ok) {
        throw new Error("Failed to fetch market agents");
      }
      const result = await response.json();

      if (!Array.isArray(result)) {
        throw new Error("Invalid agent market response");
      }

      // Transform the data to match our MarketAgent interface
      const transformedAgents: MarketAgent[] = result.map(
        (item: MarketAgentApiResponse) => ({
          id: item.agentId?.toString() || "",
          name: item.agentJson?.name || "",
          description: item.agentJson?.description || "",
          systemPrompt: item.agentJson?.systemPrompt || "",
          selectedMCPs: item.agentJson?.selectedMCPs || [],
          disableToolReferences: item.agentJson?.disableToolReferences || [],
          version: "1.0.0",
          keywords: [],
          createdAt: item.agentJson?.createdAt || item.createdAt || "",
          updatedAt: item.agentJson?.updatedAt || item.updatedAt || "",
        }),
      );

      setMarketAgents(transformedAgents);

      // Check which agents are already installed by comparing names
      const installedIds = new Set<string>();
      transformedAgents.forEach((marketAgent) => {
        const isInstalled = availableAgents.some(
          (userAgent: Agent) => userAgent.name === marketAgent.name,
        );
        if (isInstalled) {
          installedIds.add(marketAgent.id);
        }
      });
      setInstalledAgents(installedIds);
    } catch (error) {
      console.error("Error fetching market agents:", error);
      toast.error("Failed to load agent market");
    } finally {
      setLoadingMarketAgents(false);
    }
  }, [availableAgents]);

  // Update installed status when availableAgents or marketAgents changes
  useEffect(() => {
    if (marketAgents.length > 0) {
      const installedIds = new Set<string>();
      marketAgents.forEach((marketAgent) => {
        const isInstalled = availableAgents.some(
          (userAgent: Agent) => userAgent.name === marketAgent.name,
        );
        if (isInstalled) {
          installedIds.add(marketAgent.id);
        }
      });
      setInstalledAgents(installedIds);
    }
  }, [availableAgents, marketAgents]);

  return {
    marketAgents,
    loadingMarketAgents,
    installedAgents,
    fetchMarketAgents,
    setInstalledAgents,
  };
}
