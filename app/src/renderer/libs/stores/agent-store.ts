import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getApiBaseUrl } from "../env";

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  disableToolReferences: Array<{
    mcpName: string;
    toolName: string;
    reason?: string;
  }>;
  predefined: boolean;
  selectedMCPs?: string[];
  createdAt: string;
  updatedAt: string;
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
  updateAgent: (agent: Agent) => Promise<void>;
  createAgent: (agent: Agent) => Promise<Agent>;
  deleteAgent: (agentId: string) => Promise<boolean>;
  triggerAgentSelect: (
    e: React.MouseEvent<HTMLButtonElement>,
    selectedAgent: Agent | null | undefined,
  ) => Promise<void>;
  handleAgentChange: (accept: boolean) => void;
  subscribeToAgentChanges: () => () => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => {
      const savedAgent = localStorage.getItem("selectedAgent");
      const savedAgents = localStorage.getItem("availableAgents");

      const baseUrl = getApiBaseUrl();

      const defaultAgent: Agent = {
        id: "", // Special ID for the default agent
        name: "Default Assistant",
        description: "The default assistant with general capabilities.",
        systemPrompt: "",
        disableToolReferences: [],
        predefined: true,
        selectedMCPs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
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
        },

        fetchAgents: async () => {
          try {
            console.log("Fetching available agents from foxychat-server...");
            const response = await fetch(`${baseUrl}/agents`, {
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include", // Include cookies for authentication
            });

            if (response.ok) {
              const agents = await response.json();
              console.log("Agents:", agents);

              if (Array.isArray(agents)) {
                console.log(`Store loaded ${agents.length} agents`);
                const agentsWithDefault = [
                  defaultAgent,
                  ...agents.filter(
                    (agent: Agent) => agent.id !== "DefaultAssistant",
                  ),
                ];
                get().setAvailableAgents(agentsWithDefault);

                // Update selected agent if it exists in the new list
                const currentSelected = get().selectedAgent;
                if (currentSelected) {
                  const updatedSelectedAgent = agentsWithDefault.find(
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
              } else {
                console.error(
                  "Invalid response format: expected array of agents",
                );
              }
            } else {
              console.error(
                "Error fetching agents:",
                response.status,
                response.statusText,
              );
            }
          } catch (error) {
            console.error("Error fetching agents:", error);
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

        updateAgent: async (agent: Agent) => {
          try {
            const response = await fetch(`${baseUrl}/agents/${agent.id}`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify({
                name: agent.name,
                description: agent.description,
                systemPrompt: agent.systemPrompt,
                disableToolReferences: agent.disableToolReferences,
                selectedMCPs: agent.selectedMCPs,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => null);
              throw new Error(
                `Failed to update agent: ${response.status} ${errorData?.error || response.statusText}`,
              );
            }

            const updatedAgent = await response.json();
            get().updateSelectedAgent(updatedAgent);
            get().updateAvailableAgent(updatedAgent);
          } catch (error) {
            console.error("Error saving agent:", error);
            throw error;
          }
        },

        createAgent: async (agentData) => {
          try {
            const response = await fetch(`${baseUrl}/agents`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify(agentData),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => null);
              throw new Error(
                `Failed to create agent: ${response.status} ${errorData?.error || response.statusText}`,
              );
            }

            const newAgent = await response.json();

            // Add to available agents
            const currentAgents = get().availableAgents;
            const updatedAgents = [...currentAgents, newAgent];
            get().setAvailableAgents(updatedAgents);

            return newAgent;
          } catch (error) {
            console.error("Error creating agent:", error);
            throw error;
          }
        },

        deleteAgent: async (agentId: string) => {
          try {
            const response = await fetch(`${baseUrl}/agents/${agentId}`, {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => null);
              throw new Error(
                `Failed to delete agent: ${response.status} ${errorData?.error || response.statusText}`,
              );
            }

            // Remove from available agents
            const currentAgents = get().availableAgents;
            const updatedAgents = currentAgents.filter(
              (agent) => agent.id !== agentId,
            );
            get().setAvailableAgents(updatedAgents);

            // Clear selected agent if it was deleted
            const selectedAgent = get().selectedAgent;
            if (selectedAgent?.id === agentId) {
              get().setSelectedAgent(null);
            }

            return true;
          } catch (error) {
            console.error("Error deleting agent:", error);
            return false;
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
