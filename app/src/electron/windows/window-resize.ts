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
  window.setResizable(expanded);
  if (expanded) {
    window.setMaximizable(true);
    window.removeAllListeners("will-resize");
  } else {
    window.setMaximizable(false);
    window.on("will-resize", (event) => {
      if (!isExpandedView) {
        event.preventDefault();
      }
    });
  }
}

/**
 * Get current expanded view mode state
 */
export function isInExpandedViewMode(): boolean {
  return isExpandedView;
}
