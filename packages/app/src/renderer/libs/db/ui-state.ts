/**
 * UI State Store (Zustand)
 *
 * Only for pure UI state management, no data persistence
 * Data storage uses Dexie hooks
 *
 * Contains:
 * - Current selected conversation ID
 * - Current selected Agent ID
 * - Current selected model config
 * - UI loading state
 * - Temporary UI state (popups, recording, etc.)
 */

import { create } from "zustand";
import {
  DEFAULT_LOCAL_AI_MODEL_ID,
  DEFAULT_LOCAL_AI_PROVIDER_ID,
} from "../local-ai-contract";

// Re-export for convenience
export {
  DEFAULT_LOCAL_AI_MODEL_ID,
  DEFAULT_LOCAL_AI_PROVIDER_ID,
} from "../local-ai-contract";

// ==================== Selection State ====================

interface SelectionState {
  // Currently selected items
  currentConversationId: string | null;
  selectedAgentId: string | null;
  selectedConfigId: string;
  selectedModelId: string;

  // Actions
  setCurrentConversation: (id: string | null) => void;
  setSelectedAgent: (id: string | null) => void;
  setSelectedModel: (configId: string, modelId: string) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  currentConversationId: null,
  selectedAgentId: null,
  selectedConfigId: DEFAULT_LOCAL_AI_PROVIDER_ID,
  selectedModelId: DEFAULT_LOCAL_AI_MODEL_ID,

  setCurrentConversation: (id) => set({ currentConversationId: id }),
  setSelectedAgent: (id) => set({ selectedAgentId: id }),
  setSelectedModel: (configId, modelId) =>
    set({ selectedConfigId: configId, selectedModelId: modelId }),
}));

// ==================== Chat UI State ====================

interface ChatUIState {
  viewMode: "compact" | "expanded";
  isVoiceInputActive: boolean;
  showControls: boolean;

  setViewMode: (mode: "compact" | "expanded") => void;
  toggleViewMode: () => void;
  setVoiceInputActive: (active: boolean) => void;
  setShowControls: (show: boolean) => void;
}

export const useChatUIState = create<ChatUIState>((set, get) => ({
  viewMode: "compact",
  isVoiceInputActive: false,
  showControls: false,

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleViewMode: () => {
    const newMode = get().viewMode === "compact" ? "expanded" : "compact";
    set({ viewMode: newMode });

    // Notify Electron main process
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.toggleViewMode?.(newMode === "expanded");
    }
  },
  setVoiceInputActive: (active) => set({ isVoiceInputActive: active }),
  setShowControls: (show) => set({ showControls: show }),
}));

// ==================== Settings UI State ====================

interface SettingsUIState {
  currentTheme: "light" | "dark" | "system";
  devModeEnabled: boolean;
  experimentalFeatures: {
    enableMainWindow: boolean;
  };

  // Shortcut recording
  activeShortcut: string | null;
  recordingShortcut: string;

  setTheme: (theme: "light" | "dark" | "system") => void;
  setDevMode: (enabled: boolean) => void;
  setExperimentalFeature: (feature: string, enabled: boolean) => void;
  setActiveShortcut: (shortcut: string | null) => void;
  setRecordingShortcut: (shortcut: string) => void;
}

export const useSettingsUIState = create<SettingsUIState>((set) => ({
  currentTheme: "light",
  devModeEnabled: false,
  experimentalFeatures: {
    enableMainWindow: false,
  },
  activeShortcut: null,
  recordingShortcut: "",

  setTheme: (theme) => set({ currentTheme: theme }),
  setDevMode: (enabled) => set({ devModeEnabled: enabled }),
  setExperimentalFeature: (feature, enabled) =>
    set((state) => ({
      experimentalFeatures: {
        ...state.experimentalFeatures,
        [feature]: enabled,
      },
    })),
  setActiveShortcut: (shortcut) =>
    set({
      activeShortcut: shortcut,
      recordingShortcut: shortcut ? "Press keys..." : "",
    }),
  setRecordingShortcut: (shortcut) => set({ recordingShortcut: shortcut }),
}));

// ==================== Loading State ====================

interface LoadingState {
  isInitializing: boolean;
  isSaving: boolean;

  setInitializing: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
}

export const useLoadingState = create<LoadingState>((set) => ({
  isInitializing: true,
  isSaving: false,

  setInitializing: (loading) => set({ isInitializing: loading }),
  setSaving: (saving) => set({ isSaving: saving }),
}));

// ==================== Search UI State ====================

interface SearchUIState {
  isSearchOpen: boolean;
  searchQuery: string;

  openSearch: () => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
}

export const useSearchUIState = create<SearchUIState>((set) => ({
  isSearchOpen: false,
  searchQuery: "",

  openSearch: () => set({ isSearchOpen: true, searchQuery: "" }),
  closeSearch: () => set({ isSearchOpen: false, searchQuery: "" }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
