import { Menu, Tray, app, nativeImage } from "electron";
import fs from "fs";
import path from "path";
import { createMainWindow, getMainWindow } from "./windows/main-window";

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

  // Let system handle natural click behavior on macOS

  tray.setToolTip("Convera");

  // Create context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Main Window",
      click: () => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      },
    },
    {
      type: "separator",
    },
    {
      label: "Open Settings",
      click: () => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          // Navigate to settings view in renderer
          mainWindow.webContents.send("navigate-to-settings");
        } else {
          createMainWindow();
        }
      },
    },
    {
      type: "separator",
    },
    {
      label: "Quit Convera",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Left click to show menu with better state management
  let menuShown = false;
  tray.on("click", () => {
    if (!menuShown && tray) {
      tray.popUpContextMenu();
      menuShown = true;
      // Reset flag after a short delay to allow for menu interaction
      setTimeout(() => {
        menuShown = false;
      }, 100);
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
