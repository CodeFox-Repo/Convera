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
  toolNames?: string[];
  toolReferences?: ToolReference[];
}

interface AgentState {
  selectedAgent: Agent | null;
  agentChanged: boolean;
  prevAgentId: string | null;
  availableAgents: Agent[];

  setSelectedAgent: (agent: Agent | null) => void;
  setAvailableAgents: (agents: Agent[]) => void;
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
          window.electronAPI.toggleAgentPopover();

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
          window.dispatchEvent(new Event("availableAgents-updated"));
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

            const dpr = window.devicePixelRatio || 1;
            const contentRight = rect.right * dpr;
            const contentTop = rect.top * dpr;

            const width = 240;
            const height = 300;

            const absX = Math.round(winX + contentRight - width);
            const absY = Math.round(winY + contentTop);

            window.electronAPI.toggleAgentPopover(absX, absY, width, height);
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
              try {
                const parsedAgent = JSON.parse(event.newValue);
                set({
                  selectedAgent: parsedAgent === "null" ? null : parsedAgent,
                });
              } catch (error) {
                console.error(
                  "Error parsing selectedAgent from storage:",
                  error,
                );
              }
            }

            if (event.key === "availableAgents" && event.newValue) {
              try {
                const parsedAgents = JSON.parse(event.newValue);
                set({ availableAgents: parsedAgents });
              } catch (error) {
                console.error(
                  "Error parsing availableAgents from storage:",
                  error,
                );
              }
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
