import { ThemeMode } from "@/shared/types/theme-mode";

const THEME_KEY = "theme";

export interface ThemePreferences {
  system: ThemeMode;
  local: ThemeMode | null;
}

export async function getCurrentTheme(): Promise<ThemePreferences> {
  // Check for electronAPI availability
  if (!window.electronAPI) {
    console.error("electronAPI is not available for getting current theme!");
    return {
      system: "light", // Default to light if API not available
      local: localStorage.getItem(THEME_KEY) as ThemeMode | null,
    };
  }

  try {
    const currentTheme = await window.electronAPI.getCurrentTheme();
    const localTheme = localStorage.getItem(THEME_KEY) as ThemeMode | null;

    return {
      system:
        typeof currentTheme === "string"
          ? (currentTheme as ThemeMode)
          : "light",
      local: localTheme,
    };
  } catch (error) {
    console.error("Error getting current theme:", error);
    return {
      system: "light", // Default to light on error
      local: localStorage.getItem(THEME_KEY) as ThemeMode | null,
    };
  }
}

export async function toggleTheme() {
  if (!window.electronAPI) {
    console.error("electronAPI is not available for toggling theme!");
    return;
  }

  try {
    // Get current theme to determine toggle direction
    const currentTheme = await window.electronAPI.getCurrentTheme();
    const newTheme = currentTheme === "dark" ? "light" : "dark";

    // Use the unified setTheme API
    const resultTheme = await window.electronAPI.setTheme(newTheme);

    // Update document theme based on result
    const isDarkMode =
      typeof resultTheme === "string" ? resultTheme === "dark" : false;
    updateDocumentTheme(isDarkMode);

    // Save the preference to localStorage
    localStorage.setItem(THEME_KEY, newTheme);
  } catch (error) {
    console.error("Error toggling theme:", error);
  }
}

function updateDocumentTheme(isDarkMode: boolean) {
  if (!isDarkMode) {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
  }
}
