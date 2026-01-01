/**
 * UI State Store (Zustand)
 *
 * 仅用于纯 UI 状态管理，不涉及数据持久化
 * 数据存储使用 Dexie hooks
 *
 * 包含：
 * - 当前选中的对话 ID
 * - 当前选中的 Agent ID
 * - 当前选中的模型配置
 * - UI 加载状态
 * - 临时 UI 状态（如弹窗、录音等）
 */

import { create } from "zustand";
import { FOXYCHAT_CONFIG_ID, DEFAULT_FOXYCHAT_MODELS } from "./database";

// Re-export for convenience
export { FOXYCHAT_CONFIG_ID, DEFAULT_FOXYCHAT_MODELS };

// ==================== Selection State ====================

interface SelectionState {
  // 当前选中项
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
  selectedConfigId: FOXYCHAT_CONFIG_ID,
  selectedModelId: DEFAULT_FOXYCHAT_MODELS[0],

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

    // 通知 Electron 主进程
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
