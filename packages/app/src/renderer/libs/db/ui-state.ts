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

// Re-export for convenience
export {
  DEFAULT_LOCAL_AI_MODEL_ID,
  DEFAULT_LOCAL_AI_PROVIDER_ID,
} from "../local-ai";

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
  setSelectedModel: (configId, modelId) => {
    set({ selectedConfigId: configId, selectedModelId: modelId });
    void db.settings.put({
      key: "local-ai-selection",
      value: { configId, modelId },
      updatedAt: new Date(),
    });
  },
}));

void db.settings.get("local-ai-selection").then((record) => {
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
    useSelectionStore.setState({
      selectedConfigId: value.configId,
      selectedModelId: value.modelId,
    });
  }
});

// ==================== Unread State ====================

const LAST_SEEN_KEY = "conversation-last-seen";

function loadLastSeen(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

interface UnreadState {
  /** conversationId -> epoch ms of the last time the user looked at it. */
  lastSeen: Record<string, number>;
  markSeen: (conversationId: string) => void;
}

/**
 * A conversation with no entry counts as seen: every existing conversation
 * predates this store, and opening the app to an all-bold sidebar is noise.
 */
export const useUnreadStore = create<UnreadState>((set, get) => ({
  lastSeen: loadLastSeen(),
  markSeen: (conversationId) => {
    const lastSeen = { ...get().lastSeen, [conversationId]: Date.now() };
    set({ lastSeen });
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(lastSeen));
  },
}));

export function isUnread(
  lastSeen: Record<string, number>,
  conversationId: string,
  updatedAt: Date | undefined,
): boolean {
  const seenAt = lastSeen[conversationId];
  return seenAt !== undefined && updatedAt !== undefined
    ? updatedAt.getTime() > seenAt
    : false;
}

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
