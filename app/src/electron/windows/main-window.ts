import { calculateWindowDimensions } from "@/electron/windows/utils";
import {
  positionWindowAtCenterBottom,
  setWindowHidden,
} from "@/electron/windows/window-position";
import { setMainWindowResizable } from "@/electron/windows/window-resize";
import { WINDOW_SIZE_PRESETS } from "@/electron/windows/window-size";
import { injectWindowStyles } from "@/electron/windows/window-styles";
import { inDevelopment } from "@/shared/constants/dev";
import { BrowserWindow, screen } from "electron";
import path from "path";

export function createMainWindow() {
  const preload = path.join(__dirname, "preload.js");

  // Initial dimensions that we'll also use as desired bounds
  const dimensions = calculateWindowDimensions(WINDOW_SIZE_PRESETS.MAIN);

  // Store desired bounds for restoration
  let desiredBounds = {
    width: dimensions.width,
    height: dimensions.height,
    x: dimensions.x,
    y: dimensions.y,
  };
  let restoreTimeout: NodeJS.Timeout | null = null;

  console.log(
    `Creating main window with bounds: x=${dimensions.x}, y=${dimensions.y}, w=${dimensions.width}, h=${dimensions.height}`,
  );

  let mainWindow: BrowserWindow | null = null;
  if (process.platform === "darwin") {
    mainWindow = new BrowserWindow({
      width: dimensions.width,
      height: dimensions.height,
      x: dimensions.x,
      y: dimensions.y,
      webPreferences: {
        devTools: inDevelopment,
        contextIsolation: true,
        nodeIntegration: true,
        nodeIntegrationInSubFrames: false,
        preload: preload,
      },
      vibrancy: "fullscreen-ui",
      titleBarStyle: "hiddenInset",
      transparent: true,
      frame: false,
      visualEffectState: "active",
      thickFrame: false,
      autoHideMenuBar: true,
      hasShadow: true,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      roundedCorners: true,
      show: false,
      alwaysOnTop: true,
    });
  } else {
    mainWindow = new BrowserWindow({
      width: dimensions.width,
      height: dimensions.height,
      x: dimensions.x,
      y: dimensions.y,
      webPreferences: {
        devTools: inDevelopment,
        contextIsolation: true,
        nodeIntegration: true,
        nodeIntegrationInSubFrames: false,
        preload: preload,
      },
      vibrancy: "fullscreen-ui",
      titleBarStyle: "hiddenInset",
      frame: false,
      visualEffectState: "active",
      autoHideMenuBar: true,
      hasShadow: true,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      roundedCorners: true,
      show: false,
      alwaysOnTop: true,
      transparent: true,
    });
  }

  if (mainWindow && process.platform === "darwin") {
    mainWindow.setWindowButtonVisibility(false);
    mainWindow.setBackgroundColor("#f8fafc");
  } else if (process.platform === "win32") {
    mainWindow.setBackgroundColor("#f8fafc");
  } else {
    mainWindow.setBackgroundColor("#f8fafc");
  }

  setMainWindowResizable(false, mainWindow!);
  injectWindowStyles(mainWindow);

  if (mainWindow) {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setMenu(null);

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      mainWindow.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      );
    }

    mainWindow.once("ready-to-show", () => {
      if (mainWindow) {
        positionWindowAtCenterBottom(
          mainWindow,
          undefined,
          WINDOW_SIZE_PRESETS.MAIN,
        );

        console.log("Main window ready, position set, keeping hidden.");

        setWindowHidden(mainWindow);
      }
    });
  }

  if (inDevelopment && mainWindow) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // Add event handlers for window state
  if (mainWindow) {
    // Update desired bounds when window is manually moved/resized while focused
    const recordBounds = () => {
      if (mainWindow?.isFocused()) {
        desiredBounds = mainWindow.getBounds();
      }
    };
    mainWindow.on("resize", recordBounds);
    mainWindow.on("move", recordBounds);

    // Handle blur with checks for minimize/maximize
    mainWindow.on("blur", () => {
      if (restoreTimeout) clearTimeout(restoreTimeout);
      restoreTimeout = setTimeout(() => {
        // Only restore if window isn't focused and isn't minimized/maximized
        if (
          mainWindow &&
          !mainWindow.isFocused() &&
          !mainWindow.isMinimized() &&
          !mainWindow.isMaximized()
        ) {
          mainWindow.setBounds(desiredBounds, false);
        }
        restoreTimeout = null;
      }, 100);
    });

    // Update desired bounds when window is manually restored
    mainWindow.on("unmaximize", () => {
      if (restoreTimeout) clearTimeout(restoreTimeout);
      if (mainWindow) {
        desiredBounds = mainWindow.getBounds();
      }
    });

    mainWindow.on("restore", () => {
      if (restoreTimeout) clearTimeout(restoreTimeout);
      if (mainWindow) {
        desiredBounds = mainWindow.getBounds();
      }
    });

    // Handle display changes
    screen.on("display-metrics-changed", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setBounds(desiredBounds, false);
      }
    });
  }

  mainWindow?.on("closed", () => {
    if (restoreTimeout) {
      clearTimeout(restoreTimeout);
    }
    mainWindow = null;
  });

  return mainWindow;
}
