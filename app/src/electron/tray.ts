import { toggleChatWindowVisibility } from "@/electron/windows/window-position";
import { BrowserWindow, Tray } from "electron";
import path from "path";

let tray: Tray | null = null;

/**
 * Create and configure the system tray
 */
export function createSystemTray(chatWindow: BrowserWindow | null) {
  // Use existing icon files from the images directory
  const iconPath =
    process.platform === "darwin"
      ? path.join(__dirname, "..", "..", "images", "icon.png") // macOS prefers PNG
      : path.join(__dirname, "..", "..", "images", "icon.ico"); // Windows prefers ICO
  tray = new Tray(iconPath);
  tray.setToolTip("FoxyChat - Click to toggle");
  tray.on("click", () => {
    if (chatWindow) {
      toggleChatWindowVisibility(chatWindow);
    }
  });
}

/**
 * Clean up the system tray
 */
export function destroySystemTray() {
  if (tray) {
    tray.destroy();
    tray = null;
    console.log("System tray destroyed");
  }
}

/**
 * Get the current tray instance
 */
export function getSystemTray() {
  return tray;
}
