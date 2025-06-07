// app/src/renderer/stores/agent-store.ts
import { ToolReference } from "@/server/agents/types";
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
