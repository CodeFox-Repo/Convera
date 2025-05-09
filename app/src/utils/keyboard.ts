import { useEffect } from "react";
import { getSettings } from "./settings";

/**
 * Parse keyboard shortcut string to event properties
 */
function parseShortcut(shortcut: string): {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
} {
  const parts = shortcut.split("+").map((part) => part.trim().toLowerCase());
  const result: {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  } = {
    key: parts[parts.length - 1],
  };

  if (
    parts.includes("meta") ||
    parts.includes("command") ||
    parts.includes("cmd")
  ) {
    result.metaKey = true;
  }

  if (parts.includes("ctrl") || parts.includes("control")) {
    result.ctrlKey = true;
  }

  if (parts.includes("alt") || parts.includes("option")) {
    result.altKey = true;
  }

  if (parts.includes("shift")) {
    result.shiftKey = true;
  }

  return result;
}

/**
 * Match keyboard event against shortcut string
 */
function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);

  if (parsed.key !== event.key.toLowerCase()) return false;
  if (parsed.metaKey && !event.metaKey) return false;
  if (!parsed.metaKey && event.metaKey) return false;
  if (parsed.ctrlKey && !event.ctrlKey) return false;
  if (!parsed.ctrlKey && event.ctrlKey) return false;
  if (parsed.altKey && !event.altKey) return false;
  if (!parsed.altKey && event.altKey) return false;
  if (parsed.shiftKey && !event.shiftKey) return false;
  if (!parsed.shiftKey && event.shiftKey) return false;

  return true;
}

/**
 * Hook to register global keyboard shortcuts
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    // Handle keyboard shortcuts
    const handleKeyDown = (event: KeyboardEvent) => {
      console.log(`Key pressed: ${event.key}, metaKey: ${event.metaKey}`);
      console.log(`Key pressed: ${event.key}, ctrlKey: ${event.ctrlKey}`);

      // Command+. (period) or Command+, (comma) or Control+E to open settings
      if ((event.metaKey && (event.key === "." || event.key === ",")) || 
          (event.ctrlKey && (event.key === "." || event.key === "," || event.key.toLowerCase() === "e"))) {
        event.preventDefault();
        console.log(
          "Settings shortcut triggered, calling window.electronAPI.toggleSettingsWindow()",
        );
        try {
          // window.ipcRenderer.invoke("app:toggle-settings");
          if (window.electronAPI) {
            window.electronAPI.toggleSettingsWindow();
          } else {
            console.error("electronAPI is not available!");
          }
        } catch (error) {
          console.error("Error toggling settings window:", error);
        }
        return;
      }

      // Handle custom shortcuts from settings
      const settings = getSettings();
      const enabledShortcuts = settings.shortcuts.filter((s) => s.enabled);

      for (const shortcut of enabledShortcuts) {
        if (matchesShortcut(event, shortcut.shortcut)) {
          event.preventDefault();

          // Handle specific shortcut actions
          if (shortcut.id === "open_settings") {
            // window.ipcRenderer.invoke("app:toggle-settings");
            if (window.electronAPI) {
              window.electronAPI.toggleSettingsWindow();
            } else {
              console.error("electronAPI is not available!");
            }
          } else {
            // Add custom shortcut handling logic here
            console.log(`Shortcut activated: ${shortcut.name}`);
          }

          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
