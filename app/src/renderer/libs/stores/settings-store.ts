/**
 * Settings Store - Dexie Version
 *
 * Uses Dexie for storing settings data
 * Uses Zustand for UI state management (theme, shortcut recording, etc.)
 *
 * Retained features:
 * - Theme switching (requires IPC to notify main process)
 * - Shortcut management (requires IPC to notify main process)
 * - Settings persistence
 */

import { useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useSetting, setSetting, getSetting } from "../db";
import { useSettingsUIState } from "../db/ui-state";
import {
  getCurrentTheme,
  toggleTheme,
} from "@/renderer/libs/helper/theme_helpers";
import {
  AppSettings,
  ShortcutSettings,
  OpenAISettings,
} from "@/shared/types/settings";

// ==================== Settings Keys ====================

const SETTINGS_KEYS = {
  OPENAI: "openai",
  SHORTCUTS: "shortcuts",
  MCP: "mcp",
} as const;

// ==================== Default Values ====================

// Initialization flag to prevent multiple initializations and infinite loops
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

const DEFAULT_OPENAI_SETTINGS: OpenAISettings = {
  endpoint: "",
  apiKey: "",
  modelId: "google/gemini-2.5-flash",
  supportedModels: [
    "google/gemini-2.5-flash",
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "qwen/qwq-32b",
    "anthropic/claude-3.7-sonnet",
    "openai/o3-mini",
  ],
  useRemoteStore: true,
};

async function getDefaultShortcuts(): Promise<ShortcutSettings[]> {
  const isMac =
    typeof window !== "undefined" && navigator.userAgent.includes("Mac");

  return [
    {
      id: "activate",
      name: "Activate App",
      shortcut: isMac ? "Alt+Space" : "Control+Shift+Space",
      enabled: true,
    },
    {
      id: "open_settings",
      name: "Open Settings",
      shortcut: isMac ? "Command+," : "Control+E",
      enabled: true,
    },
  ];
}

// ==================== Hooks ====================

/**
 * Main Settings store hook
 * Replaces the old useSettingsStore
 */
export function useSettingsStore() {
  // Get settings from Dexie
  const openaiSettings = useSetting<OpenAISettings>(
    SETTINGS_KEYS.OPENAI,
    DEFAULT_OPENAI_SETTINGS,
  );
  const shortcuts = useSetting<ShortcutSettings[]>(SETTINGS_KEYS.SHORTCUTS, []);

  // UI state
  const uiState = useSettingsUIState();

  // Memoize the settings object to prevent infinite re-renders
  const settings: AppSettings = useMemo(
    () => ({
      openai: openaiSettings,
      shortcuts: shortcuts.length > 0 ? shortcuts : [],
      mcp: { tools: {}, server: { serverUrl: "", requestTimeout: 30000 } },
    }),
    [openaiSettings, shortcuts],
  );

  // Memoize callbacks to prevent unnecessary re-renders
  const initializeSettings = useCallback(async () => {
    // Prevent multiple initializations to avoid infinite loops
    if (isInitialized) {
      return;
    }

    if (initializationPromise) {
      return initializationPromise;
    }

    initializationPromise = (async () => {
      try {
        // Load default shortcuts if none exist
        const existingShortcuts = await getSetting<ShortcutSettings[]>(
          SETTINGS_KEYS.SHORTCUTS,
        );
        if (!existingShortcuts || existingShortcuts.length === 0) {
          const defaultShortcuts = await getDefaultShortcuts();
          await setSetting(SETTINGS_KEYS.SHORTCUTS, defaultShortcuts);
        }

        // Get current theme
        try {
          const themeResult = await getCurrentTheme();
          uiState.setTheme(themeResult.system as "light" | "dark" | "system");
        } catch (error) {
          console.error("Failed to get current theme:", error);
        }

        isInitialized = true;
      } finally {
        initializationPromise = null;
      }
    })();

    return initializationPromise;
  }, [uiState]);

  const handleOpenAIChange = useCallback(
    async (field: string, value: string) => {
      if (field === "apiKey" && value.trim() && value.startsWith("Bearer ")) {
        toast.warning('Please enter the API key without "Bearer" prefix');
        return;
      }

      const updatedOpenAI = {
        ...openaiSettings,
        [field]: value,
      };

      await setSetting(SETTINGS_KEYS.OPENAI, updatedOpenAI);

      if (field === "modelId") {
        window.dispatchEvent(
          new CustomEvent("model-selected", {
            detail: { modelId: value },
          }),
        );
        toast.success("Model updated");
      } else if (field === "useRemoteStore") {
        toast.success("Remote store setting updated");
      } else {
        toast.success("Settings saved");
      }
    },
    [openaiSettings],
  );

  const handleAddSupportedModel = useCallback(
    async (model: string) => {
      if (!model.trim() || openaiSettings.supportedModels.includes(model)) {
        if (openaiSettings.supportedModels.includes(model)) {
          toast.error("Model already in the list");
        }
        return;
      }

      const updatedOpenAI = {
        ...openaiSettings,
        supportedModels: [...openaiSettings.supportedModels, model],
      };

      await setSetting(SETTINGS_KEYS.OPENAI, updatedOpenAI);
      toast.success("Model added to supported list");
    },
    [openaiSettings],
  );

  const handleRemoveSupportedModel = useCallback(
    async (model: string) => {
      const updatedOpenAI = {
        ...openaiSettings,
        supportedModels: openaiSettings.supportedModels.filter(
          (m) => m !== model,
        ),
      };

      await setSetting(SETTINGS_KEYS.OPENAI, updatedOpenAI);
      toast.success("Model removed from supported list");
    },
    [openaiSettings],
  );

  const handleResetShortcuts = useCallback(async () => {
    const defaultShortcuts = await getDefaultShortcuts();
    await setSetting(SETTINGS_KEYS.SHORTCUTS, defaultShortcuts);

    // Update the main process with the new activate shortcut
    const activateShortcut = defaultShortcuts.find((s) => s.id === "activate");
    if (activateShortcut && activateShortcut.enabled && window.electronAPI) {
      try {
        await window.electronAPI.updateGlobalShortcut(activateShortcut.shortcut);
        toast.success("Shortcuts reset to default");
      } catch (error) {
        console.error("Error updating global shortcut after reset:", error);
        toast.warning("Shortcuts reset, but global shortcut update failed");
      }
    } else {
      toast.success("Shortcuts reset to default");
    }
  }, []);

  const handleToggleTheme = useCallback(async () => {
    try {
      await toggleTheme();
      const { system } = await getCurrentTheme();
      uiState.setTheme(system as "light" | "dark" | "system");
      toast.success(`Theme switched to ${system} mode`);
    } catch (error) {
      console.error("Error toggling theme:", error);
      toast.error("Failed to toggle theme");
    }
  }, [uiState]);

  const saveRecordedShortcut = useCallback(
    async (shortcut: string) => {
      const { activeShortcut } = uiState;
      if (!activeShortcut || !shortcut) return;

      const currentShortcuts =
        (await getSetting<ShortcutSettings[]>(SETTINGS_KEYS.SHORTCUTS)) || [];
      const updatedShortcuts = currentShortcuts.map((s) =>
        s.id === activeShortcut ? { ...s, shortcut } : s,
      );

      await setSetting(SETTINGS_KEYS.SHORTCUTS, updatedShortcuts);

      // Update global shortcut if it's the activate shortcut
      if (activeShortcut === "activate" && window.electronAPI) {
        try {
          await window.electronAPI.updateGlobalShortcut(shortcut);
        } catch (error) {
          console.error("Error updating global shortcut:", error);
        }
      }

      uiState.setActiveShortcut(null);
      toast.success("Shortcut updated");
    },
    [uiState],
  );

  const subscribeToSettingsChanges = useCallback(() => {
    // No-op, Dexie liveQuery handles reactivity
    return () => {};
  }, []);

  return {
    // State
    settings,
    settingsLoading: false,
    settingsInitialized: true,
    currentTheme: uiState.currentTheme,
    activeShortcut: uiState.activeShortcut,
    recordingShortcut: uiState.recordingShortcut,
    devModeEnabled: uiState.devModeEnabled,
    experimentalFeatures: uiState.experimentalFeatures,

    // Actions
    initializeSettings,
    handleOpenAIChange,
    handleAddSupportedModel,
    handleRemoveSupportedModel,
    handleResetShortcuts,
    handleToggleTheme,

    // Shortcut recording actions
    setActiveShortcut: uiState.setActiveShortcut,
    setRecordingShortcut: uiState.setRecordingShortcut,
    saveRecordedShortcut,

    // UI state actions
    setDevModeEnabled: uiState.setDevMode,
    setExperimentalFeature: uiState.setExperimentalFeature,

    subscribeToSettingsChanges,
  };
}

// ==================== Standalone Actions ====================

/**
 * Update OpenAI settings (without hook)
 */
export async function updateOpenAISettings(
  updates: Partial<OpenAISettings>,
): Promise<AppSettings> {
  const current =
    (await getSetting<OpenAISettings>(SETTINGS_KEYS.OPENAI)) ||
    DEFAULT_OPENAI_SETTINGS;
  const updated = { ...current, ...updates };
  await setSetting(SETTINGS_KEYS.OPENAI, updated);

  return {
    openai: updated,
    shortcuts:
      (await getSetting<ShortcutSettings[]>(SETTINGS_KEYS.SHORTCUTS)) || [],
    mcp: { tools: {}, server: { serverUrl: "", requestTimeout: 30000 } },
  };
}

/**
 * Update shortcut (without hook)
 */
export async function updateShortcut(
  shortcut: ShortcutSettings,
): Promise<AppSettings> {
  const shortcuts =
    (await getSetting<ShortcutSettings[]>(SETTINGS_KEYS.SHORTCUTS)) || [];
  const existingIndex = shortcuts.findIndex((s) => s.id === shortcut.id);

  if (existingIndex >= 0) {
    shortcuts[existingIndex] = shortcut;
  } else {
    shortcuts.push(shortcut);
  }

  await setSetting(SETTINGS_KEYS.SHORTCUTS, shortcuts);

  // Update global shortcut if it's the activate shortcut
  if (shortcut.id === "activate" && window.electronAPI) {
    try {
      await window.electronAPI.updateGlobalShortcut(shortcut.shortcut);
    } catch (error) {
      console.error("Error updating global shortcut:", error);
    }
  }

  return {
    openai:
      (await getSetting<OpenAISettings>(SETTINGS_KEYS.OPENAI)) ||
      DEFAULT_OPENAI_SETTINGS,
    shortcuts,
    mcp: { tools: {}, server: { serverUrl: "", requestTimeout: 30000 } },
  };
}

/**
 * Get settings (without hook)
 */
export async function getSettings(): Promise<AppSettings> {
  const openai =
    (await getSetting<OpenAISettings>(SETTINGS_KEYS.OPENAI)) ||
    DEFAULT_OPENAI_SETTINGS;
  let shortcuts = await getSetting<ShortcutSettings[]>(SETTINGS_KEYS.SHORTCUTS);

  if (!shortcuts || shortcuts.length === 0) {
    shortcuts = await getDefaultShortcuts();
    await setSetting(SETTINGS_KEYS.SHORTCUTS, shortcuts);
  }

  return {
    openai,
    shortcuts,
    mcp: { tools: {}, server: { serverUrl: "", requestTimeout: 30000 } },
  };
}

/**
 * Initialize global shortcut
 */
export async function initGlobalShortcut(): Promise<void> {
  const shortcuts = await getSetting<ShortcutSettings[]>(
    SETTINGS_KEYS.SHORTCUTS,
  );
  const activateShortcut = shortcuts?.find((s) => s.id === "activate");

  if (activateShortcut && window.electronAPI) {
    window.electronAPI.initGlobalShortcut(activateShortcut.shortcut);
  }
}

/**
 * Reset shortcuts to default
 */
export async function resetShortcutsToDefault(): Promise<AppSettings> {
  const defaultShortcuts = await getDefaultShortcuts();
  await setSetting(SETTINGS_KEYS.SHORTCUTS, defaultShortcuts);

  return {
    openai:
      (await getSetting<OpenAISettings>(SETTINGS_KEYS.OPENAI)) ||
      DEFAULT_OPENAI_SETTINGS,
    shortcuts: defaultShortcuts,
    mcp: { tools: {}, server: { serverUrl: "", requestTimeout: 30000 } },
  };
}
