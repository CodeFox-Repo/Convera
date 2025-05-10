import { BrowserWindow } from "electron";

// Global variable to track if we're in expanded view mode
let isExpandedView = false;

/**
 * Set window resizability based on view mode
 * @param expanded Whether to enable expanded view mode
 * @param window The window to configure
 */
export function setMainWindowResizable(
  expanded: boolean,
  window: BrowserWindow,
): void {
  isExpandedView = expanded;

  // Set resizable property
  window.setResizable(expanded);

  // If switching to expanded mode, adjust other properties
  if (expanded) {
    // Allow maximizing in expanded mode
    window.setMaximizable(true);
    // Remove resize event prevention
    window.removeAllListeners("will-resize");
    console.log("Window set to resizable mode");
  } else {
    // Disable maximizing in compact mode
    window.setMaximizable(false);
    // Prevent resizing in compact mode
    window.on("will-resize", (event) => {
      // Only prevent if we're in compact mode
      if (!isExpandedView) {
        event.preventDefault();
      }
    });
    console.log("Window set to fixed size mode");
  }
}

/**
 * Get current expanded view mode state
 */
export function isInExpandedViewMode(): boolean {
  return isExpandedView;
}
