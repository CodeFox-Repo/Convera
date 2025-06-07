import { useEffect } from "react";

type WindowCloseAction =
  | { type: "toggle"; windowType: "settings" | "history" | "main" }
  | { type: "close" } // For chat window deactivation
  | { type: "custom"; handler: () => void | Promise<void> };

/**
 * Hook to handle Command+W keyboard shortcut for window closing/hiding
 * Provides unified Command+W handling across different window types
 */
export function useWindowClose(action: WindowCloseAction) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Handle Command+W (Mac) or Ctrl+W (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w") {
        // Prevent default browser/window close behavior
        event.preventDefault();
        event.stopPropagation();

        console.log(`Command+W intercepted, action type: ${action.type}`);

        try {
          if (!window.electronAPI) {
            console.error("electronAPI is not available!");
            return;
          }

          switch (action.type) {
            case "toggle":
              console.log(`Toggling window: ${action.windowType}`);
              window.electronAPI
                .toggleWindow(action.windowType)
                .catch((error: unknown) => {
                  console.error(
                    `Error toggling ${action.windowType} window:`,
                    error,
                  );
                });
              break;

            case "close":
              console.log("Triggering chat window deactivation");
              window.electronAPI.closeWindow().catch((error: unknown) => {
                console.error("Error deactivating chat window:", error);
              });
              break;

            case "custom": {
              console.log("Executing custom close handler");
              const result = action.handler();
              if (result instanceof Promise) {
                result.catch((error: unknown) => {
                  console.error("Error in custom close handler:", error);
                });
              }
              break;
            }

            default:
              console.warn("Unknown window close action type");
          }
        } catch (error) {
          console.error("Error handling Command+W:", error);
        }
      }
    };

    // Add event listener with capture to ensure we catch it before other handlers
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [action]);
}
