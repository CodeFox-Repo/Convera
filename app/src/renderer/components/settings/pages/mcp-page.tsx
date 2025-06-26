import { MarketplaceSection } from "@/renderer/components/settings/marketplace-tab";
import { useMcpStore } from "@/renderer/libs/stores/mcp-store";
import React, { useEffect } from "react";

export function McpSettingsPage() {
  const {
    mcpServers,
    loadingMcpServers,
    handleManualInstallMcp,
    handleRemoveServer,
    refreshAll: refreshMcpData,
  } = useMcpStore();

  useEffect(() => {
    const mcpStore = useMcpStore.getState();
    mcpStore.refreshAll();
  }, []);

  const marketplaceProps = {
    mcpServers,
    loadingMcpServers,
    onManualInstallMcp: handleManualInstallMcp,
    onRemoveServer: handleRemoveServer,
    onRefreshServers: refreshMcpData,
  };

  return (
    <div className="p-6">
      <MarketplaceSection {...marketplaceProps} />
    </div>
  );
}
