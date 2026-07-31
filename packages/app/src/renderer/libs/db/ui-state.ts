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
import { persistConversationProviderSelection } from "../conversation-provider-persistence";

// Re-export for convenience
export {
  DEFAULT_LOCAL_AI_MODEL_ID,
  DEFAULT_LOCAL_AI_PROVIDER_ID,
} from "../local-ai";

// ==================== Selection State ====================

const CURRENT_CONVERSATION_KEY = "current-conversation-id";

// Node-env tests import this store without a DOM.
const storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined =
  typeof localStorage === "undefined" ? undefined : localStorage;

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
  // Restored on load: a reload should reopen the room you were standing in.
  currentConversationId: storage?.getItem(CURRENT_CONVERSATION_KEY) ?? null,
  conversationSelectionVersion: 0,
  selectedAgentId: null,
  selectedConfigId: DEFAULT_LOCAL_AI_PROVIDER_ID,
  selectedModelId: DEFAULT_LOCAL_AI_MODEL_ID,
  defaultConfigId: DEFAULT_LOCAL_AI_PROVIDER_ID,
  defaultModelId: DEFAULT_LOCAL_AI_MODEL_ID,

  setCurrentConversation: (id) => {
    if (id) storage?.setItem(CURRENT_CONVERSATION_KEY, id);
    else storage?.removeItem(CURRENT_CONVERSATION_KEY);
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
      void persistConversationProviderSelection(
        conversationId,
        selection,
      ).catch((error) => {
        console.error(
          "Failed to persist the conversation provider selection:",
          error,
        );
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
