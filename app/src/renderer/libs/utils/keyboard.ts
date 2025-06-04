import { useEffect } from "react";
import { matchesShortcut } from "./keyboard-utils";
import { getSettings } from "./settings";

/** Hook to register global keyboard shortcuts */
export function useGlobalShortcuts() {
  useEffect(() => {
    // Handle keyboard shortcuts
    const handleKeyDown = (event: KeyboardEvent) => {
      console.log(`Key pressed: ${event.key}, metaKey: ${event.metaKey}`);
      console.log(`Key pressed: ${event.key}, ctrlKey: ${event.ctrlKey}`);

      // Command+. (period) or Command+, (comma) or Control+E to open settings
      if (
        (event.metaKey && (event.key === "." || event.key === ",")) ||
        (event.ctrlKey &&
          (event.key === "." ||
            event.key === "," ||
            event.key.toLowerCase() === "e"))
      ) {
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
