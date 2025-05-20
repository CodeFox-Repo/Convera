// app/src/renderer/stores/ui-store.ts
import { create } from "zustand";

interface ChatUIState {
  viewMode: "compact" | "expanded";
  showControls: boolean;
  hasExpandedOnce: boolean;

  setViewMode: (mode: "compact" | "expanded") => void;
  setShowControls: (show: boolean) => void;
  setHasExpandedOnce: (expanded: boolean) => void;
  toggleViewMode: () => void;
}

export const useChatUIStore = create<ChatUIState>((set, get) => ({
  viewMode: "compact",
  showControls: false,
  hasExpandedOnce: false,

  setViewMode: (mode) => set({ viewMode: mode }),
  setShowControls: (show) => set({ showControls: show }),
  setHasExpandedOnce: (expanded) => set({ hasExpandedOnce: expanded }),

  toggleViewMode: () => {
    const currentMode = get().viewMode;
    const newMode = currentMode === "compact" ? "expanded" : "compact";
    set({ viewMode: newMode });

    if (newMode === "expanded" && !get().hasExpandedOnce) {
      set({ hasExpandedOnce: true });
    }

    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.toggleViewMode(newMode === "expanded");
    }
  },
}));
