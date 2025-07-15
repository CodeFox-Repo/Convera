import {
  AppSettings,
  McpServerSettings,
  McpSettings,
  OpenAISettings,
  ShortcutSettings,
} from "@/shared/types/settings";

const SETTINGS_KEY = "foxchat_settings";

// Detect platform using electronAPI or fallback to navigator.platform
async function getPlatform(): Promise<string> {
  try {
    if (typeof window !== "undefined" && window.electronAPI) {
      return await window.electronAPI.getPlatform();
    }
  } catch (error) {
    console.warn(
      "Failed to detect platform via electronAPI, using fallback:",
      error,
    );
  }

  // Fallback to userAgent check (navigator.platform is deprecated)
  if (typeof window !== "undefined") {
    return navigator.userAgent.toLowerCase().includes("mac")
      ? "darwin"
      : "other";
  }

  return "other";
}

// Check if current platform is macOS
async function isMacOS(): Promise<boolean> {
  const platform = await getPlatform();
  return platform === "darwin";
}

const DEFAULT_OPENAI_SETTINGS: OpenAISettings = {
  // TODO: DISABLED LOCAL API - Empty local settings, force remote
  endpoint: "", // No default endpoint - local API disabled
  apiKey: "", // No default API key - local API disabled
  modelId: "google/gemini-2.5-flash",
  supportedModels: [
    "google/gemini-2.5-flash",
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "qwen/qwq-32b",
    "anthropic/claude-3.7-sonnet",
    "openai/o3-mini",
  ],
  useRemoteStore: true, // Default to remote server only
};

// Get default shortcuts based on platform
async function getDefaultShortcuts(): Promise<ShortcutSettings[]> {
  const isApple = await isMacOS();

  return [
    {
      id: "activate",
      name: "Activate App",
      shortcut: isApple ? "Alt+Space" : "Control+Shift+Space",
      enabled: true,
    },
    {
      id: "open_settings",
      name: "Open Settings",
      shortcut: isApple ? "Command+," : "Control+E",
      enabled: true,
    },
  ];
}

const DEFAULT_MCP_SERVER_SETTINGS: McpServerSettings = {
  serverUrl: "http://localhost:3000",
  requestTimeout: 30000,
};

const DEFAULT_MCP_SETTINGS: McpSettings = {
  tools: {},
  server: DEFAULT_MCP_SERVER_SETTINGS,
};

// Get default settings based on platform
async function getDefaultSettings(): Promise<AppSettings> {
  return {
    openai: DEFAULT_OPENAI_SETTINGS,
    shortcuts: await getDefaultShortcuts(),
    mcp: DEFAULT_MCP_SETTINGS,
  };
}

/**
 * Merges default settings with user settings from localStorage.
 */
export async function getMergedConfig(): Promise<AppSettings> {
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
      : await getDefaultShortcuts();

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
export async function getSettings(): Promise<AppSettings> {
  return await getMergedConfig();
}

/**
 * Initialize the global shortcut based on user settings
 */
export async function initGlobalShortcut(): Promise<void> {
  const settings = await getSettings();
  // Find the activate shortcut
  const activateShortcut = settings.shortcuts.find((s) => s.id === "activate");
  if (activateShortcut && window.electronAPI) {
    window.electronAPI.initGlobalShortcut(activateShortcut.shortcut);
  } else {
    console.log("No activate shortcut found or electronAPI not available");
  }
}

/**
 * Save all application settings to localStorage
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const defaultSettings = await getDefaultSettings();

    // Only save the parts that differ from default or are necessary
    const settingsToSave: Partial<AppSettings> = {};
    if (
      JSON.stringify(settings.openai) !== JSON.stringify(defaultSettings.openai)
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
export async function updateOpenAISettings(
  openaiPartial: Partial<OpenAISettings>,
): Promise<AppSettings> {
  const currentSettings = await getMergedConfig();
  const updatedOpenAI = { ...currentSettings.openai, ...openaiPartial };
  const updatedSettings = {
    ...currentSettings,
    openai: updatedOpenAI,
  };
  await saveSettings(updatedSettings);
  return updatedSettings;
}

/**
 * Add or update a shortcut
 */
export async function updateShortcut(
  shortcut: ShortcutSettings,
): Promise<AppSettings> {
  const currentSettings = await getMergedConfig();
  const shortcuts = [...currentSettings.shortcuts]; // Create a copy
  const existingIndex = shortcuts.findIndex((s) => s.id === shortcut.id);

  if (existingIndex >= 0) {
    shortcuts[existingIndex] = shortcut;
  } else {
    shortcuts.push(shortcut);
  }

  const updatedSettings = { ...currentSettings, shortcuts };
  await saveSettings(updatedSettings);

  // If this is the activate app shortcut, update the main process via IPC
  if (
    shortcut.id === "activate" &&
    typeof window !== "undefined" &&
    window.electronAPI
  ) {
    try {
      window.electronAPI
        .updateGlobalShortcut(shortcut.shortcut)
        .then((success: boolean) => {
          console.log(
            `Global shortcut update ${success ? "succeeded" : "failed"}`,
          );
        })
        .catch((error: Error) => {
          console.error("Error updating global shortcut:", error);
        });
    } catch (error: unknown) {
      console.error("Failed to update global shortcut via electronAPI:", error);
    }
  }

  return updatedSettings;
}

/**
 * Remove a shortcut by ID
 */
export async function removeShortcut(id: string): Promise<AppSettings> {
  const currentSettings = await getMergedConfig();
  const shortcuts = currentSettings.shortcuts.filter((s) => s.id !== id);
  const updatedSettings = { ...currentSettings, shortcuts };
  await saveSettings(updatedSettings);
  return updatedSettings;
}

/**
 * Resets the shortcuts to their default values in localStorage.
 */
export async function resetShortcutsToDefault(): Promise<AppSettings> {
  const currentSettings = await getMergedConfig();
  const defaultShortcuts = await getDefaultShortcuts();
  const settingsToSave = {
    ...currentSettings, // Keep other settings like OpenAI
    shortcuts: defaultShortcuts, // Set shortcuts back to default
  };
  await saveSettings(settingsToSave);
  console.log("Shortcuts reset to default:", defaultShortcuts);
  return settingsToSave;
}

/**
 * Update MCP tool settings
 */
export async function updateMcpToolSettings(
  toolId: string,
  toolSettings: Record<string, string | number | boolean | string[] | null>,
): Promise<AppSettings> {
  const currentSettings = await getMergedConfig();
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

  await saveSettings(updatedSettings);
  return updatedSettings;
}

/**
 * Update MCP server settings
 */
export async function updateMcpServerSettings(
  serverSettings: Partial<McpServerSettings>,
): Promise<AppSettings> {
  const currentSettings = await getMergedConfig();
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

  await saveSettings(updatedSettings);
  return updatedSettings;
}
