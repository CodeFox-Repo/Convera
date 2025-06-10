// app/src/renderer/stores/agent-store.ts
import { ToolReference } from "@/server/agents/types";
import { ToolDefinition } from "@/server/mcp/types";
import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  iconUrl?: string;
  toolReferences?: ToolReference[];
  predefined?: boolean;
}

interface AgentState {
  selectedAgent: Agent | null;
  agentChanged: boolean;
  prevAgentId: string | null;
  availableAgents: Agent[];

  setSelectedAgent: (agent: Agent | null) => void;
  setAvailableAgents: (agents: Agent[]) => void;
  fetchAgents: () => Promise<void>;
  updateSelectedAgent: (updatedAgent: Agent) => void;
  updateAvailableAgent: (updatedAgent: Agent) => void;
  saveAgent: (agent: Agent) => Promise<void>;
  triggerAgentSelect: (
    e: React.MouseEvent<HTMLButtonElement>,
    selectedAgent: Agent | null | undefined,
  ) => Promise<void>;
  handleAgentChange: (accept: boolean) => void;
  subscribeToAgentChanges: () => () => void;

  // New consolidated functions for DefaultAssistant tool management
  addToolsToDefaultAssistant: (
    serverId: string,
    serverName: string,
    toolsGetter: () => Promise<ToolDefinition[]>,
    toolType?: string,
  ) => Promise<void>;
  removeToolsFromDefaultAssistant: (
    serverId: string,
    serverName: string,
    toolType?: string,
  ) => Promise<void>;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => {
      const savedAgent = localStorage.getItem("selectedAgent");
      const savedAgents = localStorage.getItem("availableAgents");

      return {
        selectedAgent: savedAgent ? JSON.parse(savedAgent) : null,
        agentChanged: false,
        prevAgentId: null,
        availableAgents: savedAgents ? JSON.parse(savedAgents) : [],

        setSelectedAgent: (agent: Agent | null) => {
          set({
            selectedAgent: agent,
            prevAgentId: get().selectedAgent?.id || null,
          });

          localStorage.setItem(
            "selectedAgent",
            agent ? JSON.stringify(agent) : "null",
          );

          if (agent) {
            console.log("triggering agent-selected event agentId:", agent.id);
          }

          window.dispatchEvent(
            new CustomEvent("agent-selected", {
              detail: { agent },
            }),
          );
        },

        setAvailableAgents: (agents: Agent[]) => {
          const current = get().availableAgents;
          if (JSON.stringify(current) === JSON.stringify(agents)) {
            return;
          }

          set({ availableAgents: agents });
          localStorage.setItem("availableAgents", JSON.stringify(agents));
          // Remove event dispatch to prevent infinite loop when called from fetchAgents
          // window.dispatchEvent(new Event("agent-list-updated"));
        },

        fetchAgents: async () => {
          console.log("Fetching available agents from store...");
          const response = await fetch("http://localhost:38000/api/agents");
          if (response.ok) {
            const data = await response.json();
            if (data.status === "success" && Array.isArray(data.agents)) {
              console.log(`Store loaded ${data.agents.length} agents`);
              get().setAvailableAgents(data.agents);

              // Update selected agent if it exists in the new list
              const currentSelected = get().selectedAgent;
              if (currentSelected) {
                const updatedSelectedAgent = data.agents.find(
                  (agent: Agent) => agent.id === currentSelected.id,
                );
                if (updatedSelectedAgent) {
                  set({ selectedAgent: updatedSelectedAgent });
                  localStorage.setItem(
                    "selectedAgent",
                    JSON.stringify(updatedSelectedAgent),
                  );
                }
              }

              // Remove the event dispatch to prevent infinite loop
              // window.dispatchEvent(new CustomEvent("agent-list-updated"));
            }
          } else {
            console.error("Error fetching agents from store:", response.status);
          }
        },

        updateSelectedAgent: (updatedAgent: Agent) => {
          set({ selectedAgent: updatedAgent });
          localStorage.setItem(
            "selectedAgent",
            updatedAgent ? JSON.stringify(updatedAgent) : "null",
          );

          console.log("Updated selected agent:", updatedAgent.name);
        },

        updateAvailableAgent: (updatedAgent: Agent) => {
          const currentAgents = get().availableAgents;
          const updatedAgents = currentAgents.map((agent) =>
            agent.id === updatedAgent.id ? updatedAgent : agent,
          );
          set({ availableAgents: updatedAgents });
          localStorage.setItem(
            "availableAgents",
            JSON.stringify(updatedAgents),
          );
          console.log("Updated available agent:", updatedAgent.name);
        },

        saveAgent: async (agent: Agent) => {
          const response = await fetch(
            `http://localhost:38000/api/agents/${agent.id}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(agent),
            },
          );

          if (!response.ok) {
            const text = await response.text();
            throw new Error(
              `Failed to update agent: ${response.status} ${text}`,
            );
          }

          get().updateSelectedAgent(agent);
          get().updateAvailableAgent(agent);
        },

        // Consolidated function to add tools to DefaultAssistant
        addToolsToDefaultAssistant: async (
          serverId: string,
          serverName: string,
          toolsGetter: () => Promise<ToolDefinition[]>,
          toolType: string = "tools",
        ) => {
          try {
            // Fetch latest agents to ensure we have current data
            await get().fetchAgents();

            // Find the DefaultAssistant agent
            const defaultAgent = get().availableAgents.find(
              (agent: Agent) => agent.id === "DefaultAssistant",
            );

            if (!defaultAgent) {
              console.warn("DefaultAssistant agent not found");
              return;
            }

            try {
              // Get the tools using the provided getter function
              const tools = await toolsGetter();

              if (tools && tools.length > 0) {
                // Create tool references for the new tools
                const newToolReferences: ToolReference[] = tools.map(
                  (tool: ToolDefinition) => ({
                    mcpName: serverId,
                    toolName: tool.name,
                    isBuiltIn:
                      serverId === "Dev-MCP" || serverId === "codefox-mcp",
                  }),
                );

                // Get current tool references and avoid duplicates
                const currentToolReferences = defaultAgent.toolReferences || [];
                const existingToolNames = new Set(
                  currentToolReferences
                    .filter((ref: ToolReference) => ref.mcpName === serverId)
                    .map((ref: ToolReference) => ref.toolName),
                );

                // Only add tools that don't already exist
                const toolsToAdd = newToolReferences.filter(
                  (newRef) => !existingToolNames.has(newRef.toolName),
                );

                if (toolsToAdd.length > 0) {
                  // Update the agent with the new tools
                  const updatedAgent = {
                    ...defaultAgent,
                    toolReferences: [...currentToolReferences, ...toolsToAdd],
                  };

                  await get().saveAgent(updatedAgent);
                  console.log(
                    `Added ${toolsToAdd.length} ${toolType} from ${serverName} to DefaultAssistant agent:`,
                    toolsToAdd.map((ref) => ref.toolName),
                  );
                  toast.success(
                    `Enabled ${toolsToAdd.length} ${toolType} from ${serverName} for DefaultAssistant`,
                  );
                }
              }
            } catch (toolError) {
              console.error(
                `Failed to get ${toolType} for ${serverName}:`,
                toolError,
              );
              // Don't show error toast here as the main operation was successful
            }
          } catch (error) {
            console.error(
              `Failed to update DefaultAssistant with ${toolType}:`,
              error,
            );
            // Don't show error toast here as the main operation was successful
          }
        },

        // Consolidated function to remove tools from DefaultAssistant
        removeToolsFromDefaultAssistant: async (
          serverId: string,
          serverName: string,
          toolType: string = "tools",
        ) => {
          try {
            // Fetch latest agents to ensure we have current data
            await get().fetchAgents();

            // Find the DefaultAssistant agent
            const defaultAgent = get().availableAgents.find(
              (agent: Agent) => agent.id === "DefaultAssistant",
            );

            if (!defaultAgent) {
              console.warn("DefaultAssistant agent not found");
              return;
            }

            // Get current tool references
            const currentToolReferences = defaultAgent.toolReferences || [];

            // Filter out tools from the specified server
            const filteredToolReferences = currentToolReferences.filter(
              (ref: ToolReference) => ref.mcpName !== serverId,
            );

            // Only update if there were tools to remove
            if (filteredToolReferences.length < currentToolReferences.length) {
              const removedCount =
                currentToolReferences.length - filteredToolReferences.length;

              // Update the agent with the filtered tools
              const updatedAgent = {
                ...defaultAgent,
                toolReferences: filteredToolReferences,
              };

              await get().saveAgent(updatedAgent);
              console.log(
                `Removed ${removedCount} ${toolType} from ${serverName} from DefaultAssistant agent`,
              );
              toast.success(
                `Removed ${removedCount} ${toolType} from ${serverName} from DefaultAssistant`,
              );
            }
          } catch (error) {
            console.error(
              `Failed to remove ${toolType} from DefaultAssistant:`,
              error,
            );
            // Don't show error toast here as the main operation was successful
          }
        },

        triggerAgentSelect: async (
          e: React.MouseEvent<HTMLButtonElement>,
          selectedAgent: Agent | null | undefined,
        ) => {
          const button = e.currentTarget;
          const rect = button.getBoundingClientRect();

          if (!window.electronAPI) {
            get().setSelectedAgent(selectedAgent ?? null);
            return;
          }

          e.stopPropagation();

          try {
            const { x: winX, y: winY } =
              await window.electronAPI.getCurrentWindowPosition();

            // Calculate absolute position relative to the window
            // Position the popover above the button, aligned to the left
            const absX = Math.round(winX + rect.left);
            const absY = Math.round(winY + rect.top - 350 - 8); // 8px gap above button, 350px is the popover height

            console.log(
              `Positioning agent popover at: x=${absX}, y=${absY} (button rect: ${rect.left}, ${rect.top}, window: ${winX}, ${winY})`,
            );

            window.electronAPI.toggleAgentPopover(absX, absY);
          } catch (err) {
            console.error("Failed to get window position:", err);
            get().setSelectedAgent(selectedAgent ?? null);
          }
        },

        handleAgentChange: (accept) => {
          if (accept) {
            set({ agentChanged: false });
          } else {
            // Revert to previous agent if not accepting the change
            const prevAgent =
              get().availableAgents.find(
                (agent) => agent.id === get().prevAgentId,
              ) || null;
            get().setSelectedAgent(prevAgent);
            set({ agentChanged: false });
          }
        },

        subscribeToAgentChanges: () => {
          const customEventHandler = ((event: CustomEvent) => {
            const { agent } = event.detail;
            set({ selectedAgent: agent });
            localStorage.setItem(
              "selectedAgent",
              agent ? JSON.stringify(agent) : "null",
            );
          }) as EventListener;

          const storageEventHandler = ((event: StorageEvent) => {
            if (event.key === "selectedAgent" && event.newValue) {
              const parsedAgent = JSON.parse(event.newValue);
              set({
                selectedAgent: parsedAgent === "null" ? null : parsedAgent,
              });
            }

            if (event.key === "availableAgents" && event.newValue) {
              const parsedAgents = JSON.parse(event.newValue);
              set({ availableAgents: parsedAgents });
            }
          }) as EventListener;

          window.addEventListener("agent-selected", customEventHandler);
          window.addEventListener("storage", storageEventHandler);

          return () => {
            window.removeEventListener("agent-selected", customEventHandler);
            window.removeEventListener("storage", storageEventHandler);
          };
        },
      };
    },
    {
      name: "agent-storage",
      partialize: (state) => ({
        selectedAgent: state.selectedAgent,
        availableAgents: state.availableAgents,
      }),
    },
  ),
);
