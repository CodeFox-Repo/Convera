/**
 * Helper function to get global CSS variables and apply them to the Electron window
 */

import { BrowserWindow } from "electron";

// Default border radius if we can't get it from CSS
const DEFAULT_BORDER_RADIUS = "12px";

/**
 * Injects window style CSS into the Electron window
 */
export function injectWindowStyles(window: BrowserWindow | null) {
  if (!window) return;

  window.webContents.on("did-finish-load", () => {
    if (window) {
      window.webContents.insertCSS(`
        body {
          border-radius: ${DEFAULT_BORDER_RADIUS};
          overflow: hidden;
          transition: all 0.3s ease-in-out;
        }
        html {
          overflow: hidden;
          transition: all 0.3s ease-in-out;
        }

        /* Match content border radius with window border radius */
        .app-container, 
        .chat-window,
        input,
        button,
        .draglayer,
        [class*="rounded"],
        div[class*="border"],
        div[class*="shadow"],
        [role="dialog"],
        [role="button"],
        .component-container {
          border-radius: ${DEFAULT_BORDER_RADIUS} !important;
        }
        
        /* Apply to specific UI components */
        .rounded-md, .rounded-lg, .rounded-xl, .rounded-2xl, .rounded-full {
          border-radius: ${DEFAULT_BORDER_RADIUS} !important;
        }
        
        /* Force all direct children of the app container to use the same border radius */
        .app-container > *,
        .chat-window > * {
          border-radius: ${DEFAULT_BORDER_RADIUS} !important;
        }
        
        /* Override any inline styles */
        [style*="border-radius"] {
          border-radius: ${DEFAULT_BORDER_RADIUS} !important;
        }
      `);
    }
  });
}
