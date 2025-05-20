// app/src/renderer/stores/agent-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  iconUrl?: string;
}

interface AgentState {
  selectedAgent: Agent | null;
  agentChanged: boolean;
  prevAgentId: string | null;

  setSelectedAgent: (agent: Agent | null) => void;
  triggerAgentSelect: (
    e: React.MouseEvent<HTMLButtonElement>,
    selectedAgent: Agent | null | undefined,
  ) => Promise<void>;
  handleAgentChange: (accept: boolean) => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      selectedAgent: null,
      agentChanged: false,
      prevAgentId: null,
      setSelectedAgent: (agent: Agent | null) => set({ selectedAgent: agent }),

      triggerAgentSelect: async (
        e: React.MouseEvent<HTMLButtonElement>,
        selectedAgent: Agent | null | undefined,
      ) => {
        const button = e.currentTarget;
        const rect = button.getBoundingClientRect();

        // Calculate global position (relative to screen)
        if (window.electronAPI) {
          e.stopPropagation();

          try {
            const { x: winX, y: winY } =
              await window.electronAPI.getCurrentWindowPosition();
            const absX = Math.round(winX + rect.left + 20);
            const absY = Math.round(winY + rect.bottom - 200);

            const width = 240;
            const height = 300;

            window.electronAPI.toggleAgentPopover(absX, absY, width, height);
          } catch (e) {
            console.error("Failed to get window position:", e);
            if (get().setSelectedAgent) {
              get().setSelectedAgent(selectedAgent ?? null);
            }
          }
        }
      },

      handleAgentChange: (accept) => {
        if (accept) {
          set({ agentChanged: false });
        } else {
          set({ agentChanged: false });
        }
      },
    }),
    {
      name: "selectedModelId",
      partialize: (state) => ({ selectedAgent: state.selectedAgent }),
    },
  ),
);
