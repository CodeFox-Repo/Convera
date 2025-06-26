import { AgentsTab } from "@/renderer/components/settings/agents-tab";
import React from "react";

interface AgentsSettingsPageProps {
  onNavigateToMcp: () => void;
}

export function AgentsSettingsPage({
  onNavigateToMcp,
}: AgentsSettingsPageProps) {
  return (
    <div className="p-6">
      <AgentsTab onNavigateToMcp={onNavigateToMcp} />
    </div>
  );
}
