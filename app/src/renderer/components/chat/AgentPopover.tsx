import React, { useEffect, useState } from "react";

interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  iconUrl?: string;
}

/**
 * AgentPopover component to be displayed in a dedicated BrowserWindow
 */
export default function AgentPopover() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // Function to fetch agents from the server
  const fetchAgents = async () => {
    try {
      console.log("Fetching available agents...");
      const response = await fetch("http://localhost:38000/api/agents");
      if (response.ok) {
        const data = await response.json();
        if (data.status === "success" && Array.isArray(data.agents)) {
          console.log(`Loaded ${data.agents.length} agents`);
          setAgents(data.agents);
        }
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
    }
  };

  // Load saved agent and fetch agents on mount
  useEffect(() => {
    // Try to load saved agent first
    try {
      const savedAgentData = localStorage.getItem("selectedAgent");
      if (savedAgentData) {
        const savedAgent = JSON.parse(savedAgentData);
        setSelectedAgent(savedAgent);
        console.log(
          "Restored selected agent from localStorage:",
          savedAgent.name,
        );
      }
    } catch (error) {
      console.error("Error loading saved agent:", error);
    }

    // Initial fetch of agents
    fetchAgents();

    // Set up listener to refetch agents when the popover window is opened
    const handlePopoverOpened = () => {
      console.log("Agent popover opened, refreshing agent list");
      fetchAgents();
    };

    // Listen for custom events for agent list updates
    const handleAgentListUpdated = () => {
      console.log("Agent list updated, refreshing agent list");
      fetchAgents();
    };

    // Listen for a custom event that can be triggered when the popover is opened
    window.addEventListener("agent-popover-opened", handlePopoverOpened);

    // Listen for a custom event that is triggered when agents are created in settings
    window.addEventListener("agent-list-updated", handleAgentListUpdated);

    // Also refetch on focus, which can happen when the window is reopened
    window.addEventListener("focus", handlePopoverOpened);

    // For cross-window communication, we'll use the custom event-based approach only
    // We need to rely on the main process to relay these events via preload scripts
    let cleanup: (() => void) | undefined;
    if (window.electronAPI && window.electronAPI.onAgentListUpdated) {
      cleanup = window.electronAPI.onAgentListUpdated(() => {
        console.log(
          "Received agent list update from IPC, refreshing agent list",
        );
        fetchAgents();
      });
    }

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
        if (agent) {
          console.log(
            `Saving agent to localStorage: ${agent.name} (${agent.id})`,
          );
          localStorage.setItem("selectedAgent", JSON.stringify(agent));
        } else {
          console.log("Removing agent from localStorage (Default Assistant)");
          localStorage.removeItem("selectedAgent");
        }

        // Dispatch custom event to notify about agent change
        console.log("Dispatching agent-selected event");
        const event = new CustomEvent("agent-selected", {
          detail: { agent },
        });
        window.dispatchEvent(event);

        // Hide Agent popover window
        window.electronAPI.toggleAgentPopover();
      } catch (error) {
        console.error("Error saving selected agent:", error);
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
          {agents.map((agent) => (
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
