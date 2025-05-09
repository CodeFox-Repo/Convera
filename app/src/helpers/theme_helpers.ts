import { ThemeMode } from "@/types/theme-mode";

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

export async function setTheme(newTheme: ThemeMode) {
  if (!window.electronAPI) {
    console.error("electronAPI is not available for setting theme!");
    return;
  }

  try {
    switch (newTheme) {
      case "dark":
        await window.electronAPI.setThemeDark();
        updateDocumentTheme(true);
        break;
      case "light":
        await window.electronAPI.setThemeLight();
        updateDocumentTheme(false);
        break;
      case "system": {
        // The system theme function now returns the resulting theme after setting
        const resultTheme = await window.electronAPI.setThemeSystem();
        // Check for string since we don't know exact return type
        const isDarkMode =
          typeof resultTheme === "string" ? resultTheme === "dark" : false;
        updateDocumentTheme(isDarkMode);
        break;
      }
    }

    localStorage.setItem(THEME_KEY, newTheme);
  } catch (error) {
    console.error(`Error setting theme to ${newTheme}:`, error);
  }
}

export async function toggleTheme() {
  if (!window.electronAPI) {
    console.error("electronAPI is not available for toggling theme!");
    return;
  }

  try {
    // The toggle function returns the new theme state
    const newTheme = await window.electronAPI.toggleTheme();
    // Check for string since we don't know exact return type
    if (typeof newTheme === "string") {
      const isDarkMode = newTheme === "dark";
      updateDocumentTheme(isDarkMode);
      localStorage.setItem(THEME_KEY, newTheme as ThemeMode);
    }
  } catch (error) {
    console.error("Error toggling theme:", error);
  }
}

export async function syncThemeWithLocal() {
  const { local } = await getCurrentTheme();
  if (!local) {
    setTheme("system");
    return;
  }

  await setTheme(local);
}

function updateDocumentTheme(isDarkMode: boolean) {
  if (!isDarkMode) {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
  }
}
