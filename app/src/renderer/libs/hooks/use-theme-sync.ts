import { useEffect } from "react";
import { getCurrentTheme } from "../helper/theme_helpers";

/**
 * Custom hook to synchronize theme changes across components
 * This hook listens for IPC theme-changed events and updates the document classes
 * It also handles initial theme setup on component mount
 */
export function useThemeSync() {
  /**
   * Applies theme classes with instant transition (no animation)
   */
  const applyThemeInstantly = (theme: string) => {
    // Add class to disable all transitions temporarily
    document.body.classList.add("instant-theme-change");

    // Apply theme changes immediately
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // Re-enable transitions after theme is applied
    setTimeout(() => {
      document.body.classList.remove("instant-theme-change");
    }, 50); // Brief delay to ensure theme change is complete
  };

  useEffect(() => {
    // Handle initial theme setup
    const setupInitialTheme = async () => {
      try {
        const { system } = await getCurrentTheme();
        applyThemeInstantly(system);
      } catch (error) {
        console.error("Error setting up initial theme:", error);
      }
    };

    // Set up initial theme
    setupInitialTheme();

    // Listen for IPC theme changes from other windows
    let cleanup: (() => void) | undefined;

    if (window.electronAPI && window.electronAPI.onThemeChanged) {
      cleanup = window.electronAPI.onThemeChanged((theme: string) => {
        console.log(`Received theme change via IPC: ${theme}`);
        applyThemeInstantly(theme);
      });
    } else {
      console.warn(
        "electronAPI.onThemeChanged not available, falling back to DOM events",
      );

      // Fallback to DOM events if IPC is not available
      const handleThemeChange = (event: CustomEvent) => {
        if (event.detail && event.detail.theme) {
          const theme = event.detail.theme;
          applyThemeInstantly(theme);
        }
      };

      window.addEventListener(
        "theme-changed",
        handleThemeChange as EventListener,
      );

      cleanup = () => {
        window.removeEventListener(
          "theme-changed",
          handleThemeChange as EventListener,
        );
      };
    }

    return cleanup;
  }, []);
}
