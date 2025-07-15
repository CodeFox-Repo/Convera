import {
  getCurrentTheme,
  toggleTheme,
} from "@/renderer/libs/helper/theme_helpers";
import {
  getSettings,
  resetShortcutsToDefault,
  updateOpenAISettings,
  updateShortcut,
} from "@/renderer/libs/utils/settings";
import { AppSettings } from "@/shared/types/settings";
import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  // Settings data
  settings: AppSettings | null;
  settingsLoading: boolean;
  settingsInitialized: boolean;
  currentTheme: string;

  // Shortcut recording state
  activeShortcut: string | null;
  recordingShortcut: string;

  // UI state
  devModeEnabled: boolean;

  // Experimental features
  experimentalFeatures: {
    enableMainWindow: boolean;
  };

  // Actions
  initializeSettings: () => Promise<void>;
  handleOpenAIChange: (field: string, value: string) => Promise<void>;
  handleAddSupportedModel: (model: string) => Promise<void>;
  handleRemoveSupportedModel: (model: string) => Promise<void>;
  handleResetShortcuts: () => Promise<void>;
  handleToggleTheme: () => Promise<void>;

  // Shortcut recording
  setActiveShortcut: (shortcut: string | null) => void;
  setRecordingShortcut: (shortcut: string) => void;
  saveRecordedShortcut: (shortcut: string) => Promise<void>;

  // UI state
  setDevModeEnabled: (enabled: boolean) => void;

  // Experimental features
  setExperimentalFeature: (feature: string, enabled: boolean) => void;

  // Event subscriptions
  subscribeToSettingsChanges: () => () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // Initial state
      settings: null,
      settingsLoading: false,
      settingsInitialized: false,
      currentTheme: "light",
      activeShortcut: null,
      recordingShortcut: "",
      devModeEnabled: false,
      experimentalFeatures: {
        enableMainWindow: false,
      },

      // Initialize settings
      initializeSettings: async () => {
        const { settingsInitialized, settingsLoading } = get();

        // Prevent multiple initializations
        if (settingsInitialized || settingsLoading) {
          return;
        }

        set({ settingsLoading: true });
        try {
          const [initialSettings, themeResult] = await Promise.all([
            getSettings(),
            getCurrentTheme(),
          ]);

          set({
            settings: initialSettings,
            currentTheme: themeResult.system,
            settingsInitialized: true,
          });

          // Sync to localStorage for cross-window communication
          localStorage.setItem(
            "foxchat_settings",
            JSON.stringify(initialSettings),
          );
        } catch (error) {
          console.error("Failed to load settings:", error);
        } finally {
          set({ settingsLoading: false });
        }
      },

      // Handle OpenAI settings changes
      handleOpenAIChange: async (field: string, value: string) => {
        const { settings } = get();
        if (!settings) return;

        // TODO: DISABLED LOCAL API - Only allow useRemoteStore changes, ignore local API fields
        if (field === "apiKey" || field === "endpoint") {
          toast.warning("Local API configuration is disabled. Use remote server only.");
          return;
        }

        const updatedOpenAI = {
          ...settings.openai,
          [field]: value,
        };

        // if (field === "apiKey" && value.trim() && value.startsWith("Bearer ")) {
        //   toast.warning('Please enter the API key without "Bearer" prefix');
        //   return;
        // }

        const updated = await updateOpenAISettings(updatedOpenAI);
        set({ settings: updated });

        // Always sync to localStorage for cross-window communication
        localStorage.setItem("foxchat_settings", JSON.stringify(updated));

        if (field === "modelId") {
          window.dispatchEvent(
            new CustomEvent("model-selected", {
              detail: { modelId: value },
            }),
          );
          localStorage.setItem("selectedModelId", value);
          toast.success("Model updated");
        } else if (field === "useRemoteStore") {
          toast.success("Remote store setting updated");
        } else {
          toast.success("Settings saved");
        }

        window.dispatchEvent(
          new CustomEvent("settings-updated", {
            detail: { field, value },
          }),
        );
      },

      // Add supported model
      handleAddSupportedModel: async (model: string) => {
        const { settings } = get();
        if (
          !settings ||
          !model.trim() ||
          settings.openai.supportedModels.includes(model)
        ) {
          if (settings?.openai.supportedModels.includes(model)) {
            toast.error("Model already in the list");
          }
          return;
        }

        const updatedOpenAI = {
          ...settings.openai,
          supportedModels: [...settings.openai.supportedModels, model],
        };

        const updated = await updateOpenAISettings(updatedOpenAI);
        set({ settings: updated });
        toast.success("Model added to supported list");
      },

      // Remove supported model
      handleRemoveSupportedModel: async (model: string) => {
        const { settings } = get();
        if (!settings?.openai?.supportedModels) return;

        const updatedOpenAI = {
          ...settings.openai,
          supportedModels: settings.openai.supportedModels.filter(
            (m) => m !== model,
          ),
        };

        const updated = await updateOpenAISettings(updatedOpenAI);
        set({ settings: updated });
        toast.success("Model removed from supported list");
      },

      // Reset shortcuts to default
      handleResetShortcuts: async () => {
        const updated = await resetShortcutsToDefault();
        if (!updated || !updated.shortcuts) {
          toast.error("Failed to reset shortcuts");
          return;
        }

        set({ settings: updated });

        // Update the main process with the new activate shortcut
        const activateShortcut = updated.shortcuts.find(
          (s: { id: string; enabled: boolean; shortcut: string }) =>
            s.id === "activate",
        );
        if (activateShortcut && activateShortcut.enabled) {
          window.electronAPI
            .updateGlobalShortcut(activateShortcut.shortcut)
            .catch((error: Error) => {
              console.error(
                "Error updating global shortcut after reset:",
                error,
              );
              toast.warning(
                "Shortcuts reset to default, but global shortcut update failed",
              );
            });
        } else {
          toast.success("Shortcuts reset to default");
        }
      },

      // Toggle theme
      handleToggleTheme: async () => {
        try {
          await toggleTheme();
          const { system } = await getCurrentTheme();
          set({ currentTheme: system });
          toast.success(`Theme switched to ${system} mode`);
        } catch (error) {
          console.error("Error toggling theme:", error);
          toast.error("Failed to toggle theme");
        }
      },

      // Shortcut recording actions
      setActiveShortcut: (shortcut: string | null) => {
        set({
          activeShortcut: shortcut,
          recordingShortcut: shortcut ? "Press keys..." : "",
        });
      },

      setRecordingShortcut: (shortcut: string) => {
        set({ recordingShortcut: shortcut });
      },

      saveRecordedShortcut: async (shortcut: string) => {
        const { activeShortcut, settings } = get();
        if (!activeShortcut || !shortcut || !settings) return;

        const shortcutConfig = settings.shortcuts.find(
          (s) => s.id === activeShortcut,
        );
        if (shortcutConfig) {
          const updated = await updateShortcut({
            ...shortcutConfig,
            shortcut: shortcut,
          });
          set({ settings: updated });
          toast.success("Shortcut updated");
        }

        set({
          activeShortcut: null,
          recordingShortcut: "",
        });
      },

      // UI state actions
      setDevModeEnabled: (enabled: boolean) => {
        set({ devModeEnabled: enabled });
      },

      // Experimental features actions
      setExperimentalFeature: (feature: string, enabled: boolean) => {
        set((state) => ({
          experimentalFeatures: {
            ...state.experimentalFeatures,
            [feature]: enabled,
          },
        }));
      },

      // Subscribe to settings changes
      subscribeToSettingsChanges: () => {
        const handleModelSelected = async (event: Event) => {
          const customEvent = event as CustomEvent;
          if (customEvent.detail && customEvent.detail.modelId) {
            const { settings } = get();
            if (settings) {
              const newModelId = customEvent.detail.modelId;
              const updatedOpenAI = {
                ...settings.openai,
                modelId: newModelId,
              };
              const updated = await updateOpenAISettings(updatedOpenAI);
              set({ settings: updated });
            }
          }
        };

        const handleStorageChange = async (event: StorageEvent) => {
          const { settings } = get();

          // Handle model selection changes
          if (event.key === "selectedModelId" && event.newValue && settings) {
            const updatedOpenAI = {
              ...settings.openai,
              modelId: event.newValue,
            };
            const updated = await updateOpenAISettings(updatedOpenAI);
            set({ settings: updated });
          }

          // Handle full settings sync across windows
          if (event.key === "foxchat_settings" && event.newValue) {
            try {
              const updatedSettings = JSON.parse(event.newValue);
              set({ settings: updatedSettings });
            } catch (error) {
              console.error(
                "Failed to parse settings from localStorage:",
                error,
              );
            }
          }
        };

        window.addEventListener("model-selected", handleModelSelected);
        window.addEventListener("storage", handleStorageChange);

        return () => {
          window.removeEventListener("model-selected", handleModelSelected);
          window.removeEventListener("storage", handleStorageChange);
        };
      },
    }),
    {
      name: "settings-storage",
      partialize: (state) => ({
        currentTheme: state.currentTheme,
        devModeEnabled: state.devModeEnabled,
        experimentalFeatures: state.experimentalFeatures,
      }),
    },
  ),
);
