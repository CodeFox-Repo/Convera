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
import { db } from "./database";
import {
  DEFAULT_LOCAL_AI_MODEL_ID,
  DEFAULT_LOCAL_AI_PROVIDER_ID,
  isLocalAIProviderId,
} from "../local-ai";
import {
  resolveConversationProviderSelection,
  resolveNativeProviderSelection,
} from "../provider-selection";

// Re-export for convenience
export {
  DEFAULT_LOCAL_AI_MODEL_ID,
  DEFAULT_LOCAL_AI_PROVIDER_ID,
} from "../local-ai";

// ==================== Selection State ====================

interface SelectionState {
  // Currently selected items
  currentConversationId: string | null;
  conversationSelectionVersion: number;
  selectedAgentId: string | null;
  selectedConfigId: string;
  selectedModelId: string;
  defaultConfigId: string;
  defaultModelId: string;

  // Actions
  setCurrentConversation: (id: string | null) => void;
  setSelectedAgent: (id: string | null) => void;
  setSelectedModel: (configId: string, modelId: string) => void;
  setDefaultModel: (configId: string, modelId: string) => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  currentConversationId: null,
  conversationSelectionVersion: 0,
  selectedAgentId: null,
  selectedConfigId: DEFAULT_LOCAL_AI_PROVIDER_ID,
  selectedModelId: DEFAULT_LOCAL_AI_MODEL_ID,
  defaultConfigId: DEFAULT_LOCAL_AI_PROVIDER_ID,
  defaultModelId: DEFAULT_LOCAL_AI_MODEL_ID,

  setCurrentConversation: (id) => {
    set((state) => ({
      currentConversationId: id,
      conversationSelectionVersion: state.conversationSelectionVersion + 1,
    }));
    if (!id) {
      const { defaultConfigId, defaultModelId } = get();
      set({
        selectedConfigId: defaultConfigId,
        selectedModelId: defaultModelId,
      });
      return;
    }

    void db.conversations.get(id).then((conversation) => {
      if (get().currentConversationId !== id || !conversation) return;
      const selection = resolveConversationProviderSelection(conversation, {
        configId: get().defaultConfigId,
        modelId: get().defaultModelId,
      });
      set({
        selectedConfigId: selection.configId,
        selectedModelId: selection.modelId,
      });
    });
  },
  setSelectedAgent: (id) => set({ selectedAgentId: id }),
  setSelectedModel: (configId, modelId) => {
    const selection = resolveNativeProviderSelection(configId, modelId);
    set({
      selectedConfigId: selection.configId,
      selectedModelId: selection.modelId,
    });
    const conversationId = get().currentConversationId;
    if (conversationId) {
      void db.conversations.update(conversationId, {
        modelId: `${selection.configId}:${selection.modelId}`,
        activeProviderId: selection.configId,
        activeModelId: selection.modelId,
        updatedAt: new Date(),
      });
      return;
    }

    get().setDefaultModel(selection.configId, selection.modelId);
  },
  setDefaultModel: (configId, modelId) => {
    const selection = resolveNativeProviderSelection(configId, modelId);
    set({
      defaultConfigId: selection.configId,
      defaultModelId: selection.modelId,
      ...(get().currentConversationId
        ? {}
        : {
            selectedConfigId: selection.configId,
            selectedModelId: selection.modelId,
          }),
    });
    void db.settings.put({
      key: "local-ai-default-selection",
      value: {
        configId: selection.configId,
        modelId: selection.modelId,
      },
      updatedAt: new Date(),
    });
  },
}));

void Promise.all([
  db.settings.get("local-ai-default-selection"),
  db.settings.get("local-ai-selection"),
]).then(([currentRecord, legacyRecord]) => {
  const record = currentRecord ?? legacyRecord;
  const value = record?.value;
  if (
    value &&
    typeof value === "object" &&
    "configId" in value &&
    "modelId" in value &&
    typeof value.configId === "string" &&
    typeof value.modelId === "string" &&
    isLocalAIProviderId(value.configId)
  ) {
    const hasActiveConversation =
      useSelectionStore.getState().currentConversationId !== null;
    useSelectionStore.setState({
      defaultConfigId: value.configId,
      defaultModelId: value.modelId,
      ...(hasActiveConversation
        ? {}
        : {
            selectedConfigId: value.configId,
            selectedModelId: value.modelId,
          }),
    });
  }
});

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
