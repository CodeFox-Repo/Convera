import {
  AppSettings,
  OpenAISettings,
  ShortcutSettings,
  McpSettings,
  McpServerSettings,
} from "@/types/settings";

const SETTINGS_KEY = "foxchat_settings";

const DEFAULT_OPENAI_SETTINGS: OpenAISettings = {
  endpoint: "https://openrouter.ai/api/v1",
  apiKey: "",
  modelId: "anthropic/claude-3.7-sonnet",
  supportedModels: [
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "qwen/qwq-32b",
    "anthropic/claude-3.7-sonnet",
    "openai/o3-mini",
  ],
};

const DEFAULT_SHORTCUTS: ShortcutSettings[] = [
  {
    id: "activate",
    name: "Activate App",
    shortcut: "Control+Space",
    enabled: true,
  },
  {
    id: "open_settings",
    name: "Open Settings",
    shortcut: "Command+.",
    enabled: true,
  },
];

const DEFAULT_MCP_SERVER_SETTINGS: McpServerSettings = {
  serverUrl: "http://localhost:3000",
  requestTimeout: 30000,
};

const DEFAULT_MCP_SETTINGS: McpSettings = {
  tools: {},
  server: DEFAULT_MCP_SERVER_SETTINGS,
};

const DEFAULT_SETTINGS: AppSettings = {
  openai: DEFAULT_OPENAI_SETTINGS,
  shortcuts: DEFAULT_SHORTCUTS,
  mcp: DEFAULT_MCP_SETTINGS,
};

/**
 * Merges default settings with user settings from localStorage.
 */
export function getMergedConfig(): AppSettings {
  let userSettings: Partial<AppSettings> = {};
  try {
    const settingsJson = localStorage.getItem(SETTINGS_KEY);
    if (settingsJson) {
      userSettings = JSON.parse(settingsJson) as Partial<AppSettings>;
    }
  } catch (error) {
    console.error("Failed to load user settings:", error);
  }

  // Deep merge OpenAI settings
  const mergedOpenAI: OpenAISettings = {
    ...DEFAULT_OPENAI_SETTINGS,
    ...(userSettings.openai || {}),
  };

  // Merge shortcuts: Use user shortcuts if they exist, otherwise default
  // You might want more sophisticated merging logic here, e.g., merging individual shortcuts
  const mergedShortcuts: ShortcutSettings[] =
    userSettings.shortcuts && userSettings.shortcuts.length > 0
      ? userSettings.shortcuts
      : DEFAULT_SHORTCUTS;

  // Merge MCP settings
  const mergedMcpSettings: McpSettings = {
    tools: { ...(userSettings.mcp?.tools || {}) },
    server: {
      ...DEFAULT_MCP_SERVER_SETTINGS,
      ...(userSettings.mcp?.server || {}),
    },
  };

  return {
    openai: mergedOpenAI,
    shortcuts: mergedShortcuts,
    mcp: mergedMcpSettings,
  };
}

/**
 * Get all application settings
 */
export function getSettings(): AppSettings {
  return getMergedConfig();
}

/**
 * Initialize the global shortcut based on user settings
 */
export function initGlobalShortcut(): void {
  if (typeof window !== "undefined" && window.require) {
    try {
      const settings = getSettings();
      // Find the activate shortcut
      const activateShortcut = settings.shortcuts.find(
        (s) => s.id === "activate",
      );
      if (activateShortcut && activateShortcut.enabled) {
        const { ipcRenderer } = window.require("electron");
        ipcRenderer
          .invoke("init-global-shortcut", activateShortcut.shortcut)
          .then((success: boolean) => {
            console.log(
              `Global shortcut initialization ${success ? "succeeded" : "already set"}`,
            );
          })
          .catch((error: Error) => {
            console.error("Error initializing global shortcut:", error);
          });
      }
    } catch (error: unknown) {
      console.error("Failed to initialize global shortcut:", error);
    }
  }
}

/**
 * Save all application settings to localStorage
 */
export function saveSettings(settings: AppSettings): void {
  try {
    // Only save the parts that differ from default or are necessary
    const settingsToSave: Partial<AppSettings> = {};
    if (
      JSON.stringify(settings.openai) !==
      JSON.stringify(DEFAULT_SETTINGS.openai)
    ) {
      settingsToSave.openai = settings.openai;
    }
    // Always save shortcuts as user might customize them
    settingsToSave.shortcuts = settings.shortcuts;

    // Save MCP settings if they exist and differ from default
    if (settings.mcp) {
      settingsToSave.mcp = settings.mcp;
    }

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsToSave));
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

/**
 * Update OpenAI settings
 */
export function updateOpenAISettings(
  openaiPartial: Partial<OpenAISettings>,
): AppSettings {
  const currentSettings = getMergedConfig();
  const updatedOpenAI = { ...currentSettings.openai, ...openaiPartial };
  const updatedSettings = {
    ...currentSettings,
    openai: updatedOpenAI,
  };
  saveSettings(updatedSettings);
  return updatedSettings;
}

/**
 * Add or update a shortcut
 */
export function updateShortcut(shortcut: ShortcutSettings): AppSettings {
  const currentSettings = getMergedConfig();
  const shortcuts = [...currentSettings.shortcuts]; // Create a copy
  const existingIndex = shortcuts.findIndex((s) => s.id === shortcut.id);

  if (existingIndex >= 0) {
    shortcuts[existingIndex] = shortcut;
  } else {
    shortcuts.push(shortcut);
  }

  const updatedSettings = { ...currentSettings, shortcuts };
  saveSettings(updatedSettings);

  // If this is the activate app shortcut, update the main process via IPC
  if (
    shortcut.id === "activate" &&
    typeof window !== "undefined" &&
    window.require
  ) {
    try {
      const { ipcRenderer } = window.require("electron");
      ipcRenderer
        .invoke("update-global-shortcut", shortcut.shortcut)
        .then((success: boolean) => {
          console.log(
            `Global shortcut update ${success ? "succeeded" : "failed"}`,
          );
        })
        .catch((error: Error) => {
          console.error("Error updating global shortcut:", error);
        });
    } catch (error: unknown) {
      console.error("Failed to update global shortcut via IPC:", error);
    }
  }

  return updatedSettings;
}

/**
 * Remove a shortcut by ID
 */
export function removeShortcut(id: string): AppSettings {
  const currentSettings = getMergedConfig();
  const shortcuts = currentSettings.shortcuts.filter((s) => s.id !== id);
  const updatedSettings = { ...currentSettings, shortcuts };
  saveSettings(updatedSettings);
  return updatedSettings;
}

/**
 * Resets the shortcuts to their default values in localStorage.
 */
export function resetShortcutsToDefault(): AppSettings {
  const currentSettings = getMergedConfig();
  const settingsToSave = {
    ...currentSettings, // Keep other settings like OpenAI
    shortcuts: DEFAULT_SHORTCUTS, // Set shortcuts back to default
  };
  saveSettings(settingsToSave);
  console.log("Shortcuts reset to default:", DEFAULT_SHORTCUTS);
  return settingsToSave;
}

/**
 * Update MCP tool settings
 */
export function updateMcpToolSettings(
  toolId: string,
  toolSettings: Record<string, string | number | boolean | string[] | null>,
): AppSettings {
  const currentSettings = getMergedConfig();
  const mcp = currentSettings.mcp || DEFAULT_MCP_SETTINGS;

  const updatedMcp = {
    ...mcp,
    tools: {
      ...mcp.tools,
      [toolId]: {
        ...(mcp.tools[toolId] || {}),
        ...toolSettings,
      },
    },
  };

  const updatedSettings = {
    ...currentSettings,
    mcp: updatedMcp,
  };

  saveSettings(updatedSettings);
  return updatedSettings;
}

/**
 * Update MCP server settings
 */
export function updateMcpServerSettings(
  serverSettings: Partial<McpServerSettings>,
): AppSettings {
  const currentSettings = getMergedConfig();
  const mcp = currentSettings.mcp || DEFAULT_MCP_SETTINGS;

  const updatedMcp = {
    ...mcp,
    server: {
      ...mcp.server,
      ...serverSettings,
    },
  };

  const updatedSettings = {
    ...currentSettings,
    mcp: updatedMcp,
  };

  saveSettings(updatedSettings);
  return updatedSettings;
}
