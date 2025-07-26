import { Menu, Tray, app, nativeImage } from "electron";
import fs from "fs";
import path from "path";

let tray: Tray | null = null;

/**
 * Create and configure the system tray
 */
export function createSystemTray() {
  let trayIcon: Electron.NativeImage;

  let trayIconPath: string;

  if (app.isPackaged) {
    trayIconPath = path.join(process.resourcesPath, "images", "tray-icon.png");
  } else {
    trayIconPath = path.join(app.getAppPath(), "images", "tray-icon.png");
  }

  console.log("Trying to load tray icon from:", trayIconPath);
  console.log("Icon file exists:", fs.existsSync(trayIconPath));

  if (fs.existsSync(trayIconPath)) {
    trayIcon = nativeImage.createFromPath(trayIconPath);
    trayIcon.setTemplateImage(true);
    console.log("Loaded custom tray icon successfully");
  } else {
    console.error("Tray icon file not found at:", trayIconPath);
    return;
  }

  tray = new Tray(trayIcon);

  if (process.platform === "darwin") {
    tray.setIgnoreDoubleClickEvents(true);
  }

  tray.setToolTip("FoxyChat");

  // Create context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Quit FoxyChat",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Left click to show menu (same as right click)
  tray.on("click", () => {
    tray.popUpContextMenu();
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
