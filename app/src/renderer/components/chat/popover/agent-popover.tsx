import { useThemeSync } from "@/renderer/libs/hooks/use-theme-sync";
import { Agent, useAgentStore } from "@/renderer/libs/stores/agent-store";
import React, { useEffect } from "react";
import client from "@/renderer/libs/apiClient";

/**
 * AgentPopover component to be displayed in a dedicated BrowserWindow
 */
// TODO: this component need to refactor
export default function AgentPopover() {
  const { 
    selectedAgent, 
    setSelectedAgent, 
    availableAgents, 
    setAvailableAgents 
  } = useAgentStore();
  
  // Listen for theme changes from settings
  useThemeSync();
  
  // Function to fetch agents from the server
  const fetchAgents = async () => {
    try {
      console.log("Fetching available agents...");
      const data = await client.api.agents.$get().then(r => r.json());
      if (data.status === "success" && Array.isArray(data.agents)) {
        console.log(`Loaded ${data.agents.length} agents`);
        setAvailableAgents(data.agents);
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
    }
  };

  useEffect(() => {
    fetchAgents();

    const handlePopoverOpened = () => {
      console.log("Agent popover opened, refreshing agent list");
      fetchAgents();
    };

    // Listen for custom events for agent list updates
    const handleAgentListUpdated = () => {
      console.log("Agent list updated, refreshing agent list");
      fetchAgents();
    };

    window.addEventListener("agent-popover-opened", handlePopoverOpened);
    window.addEventListener("agent-list-updated", handleAgentListUpdated);
    window.addEventListener("focus", handlePopoverOpened);

    let cleanup: (() => void) | undefined;
    if (window.electronAPI && window.electronAPI.onAgentListUpdated) {
      cleanup = window.electronAPI.onAgentListUpdated(() => {
        console.log(
          "Received agent list update from IPC, refreshing agent list",
        );
        fetchAgents();
      });
    }

    // Trigger event to notify popover is opened
    window.dispatchEvent(new Event("agent-popover-opened"));

    // Cleanup
    return () => {
      window.removeEventListener("agent-popover-opened", handlePopoverOpened);
      window.removeEventListener("agent-list-updated", handleAgentListUpdated);
      window.removeEventListener("focus", handlePopoverOpened);
      cleanup?.();
    };
  }, []);

  // Handle agent selection
  const handleAgentSelect = (agent: Agent | null) => {
    console.log(`Agent selected: ${agent?.name || "Default Assistant"}`);
    setSelectedAgent(agent);

    if (window.electronAPI) {
      try {
        // Hide Agent popover window
        window.electronAPI.toggleAgentPopover();
      } catch (error) {
        console.error("Error when selecting agent:", error);
      }
    }
  };

  return (
    <div className="relative">
      <div
        className="absolute -top-2 left-5 h-2 w-4 overflow-hidden"
        style={{
          clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
        }}
      >
        <div className="bg-border absolute inset-0"></div>
      </div>
      <div
        className="absolute -top-[7px] left-[22px] h-2 w-3 overflow-hidden"
        style={{
          clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
        }}
      >
        <div className="bg-background absolute inset-0"></div>
      </div>

      <div className="bg-background border-border w-60 rounded border p-2 shadow-md">
        <div className="text-foreground mb-2 text-xs font-semibold">
          Select an Agent
        </div>
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {/* Option to use no agent */}
          <div
            className={`cursor-pointer rounded p-2 ${
              !selectedAgent
                ? "bg-primary/20 text-primary"
                : "hover:bg-primary/10"
            }`}
            onClick={() => handleAgentSelect(null)}
          >
            <div className="text-primary font-medium">Default Assistant</div>
            <div className="text-muted-foreground text-xs">
              Standard AI assistant without specialization
            </div>
          </div>

          {/* List of agents */}
          {availableAgents.map((agent) => (
            <div
              key={agent.id}
              className={`cursor-pointer rounded p-2 ${
                selectedAgent?.id === agent.id
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-primary/10"
              }`}
              onClick={() => handleAgentSelect(agent)}
            >
              <div className="text-primary font-medium">{agent.name}</div>
              <div className="text-muted-foreground text-xs">
                {agent.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
