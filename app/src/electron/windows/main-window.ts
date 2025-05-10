import { calculateWindowDimensions } from "@/helpers/windows/utils";
import { positionWindowAtCenterBottom, setWindowHidden } from "@/helpers/windows/window-position";
import { setMainWindowResizable } from "@/helpers/windows/window-resize";
import { WINDOW_SIZE_PRESETS } from "@/helpers/windows/window-size";
import { injectWindowStyles } from "@/helpers/windows/window-styles";
import { inDevelopment } from "@/shared/constants/dev";
import { BrowserWindow } from "electron";
import path from "path";

export function createMainWindow() {
  const preload = path.join(__dirname, "preload.js");

  const dimensions = calculateWindowDimensions(WINDOW_SIZE_PRESETS.MAIN);

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
    });
  }
  
  
  if (mainWindow && process.platform === "darwin") {
    mainWindow.setWindowButtonVisibility(false);
    mainWindow.setBackgroundColor("#00000000");
  } else if (process.platform === "win32") {
    mainWindow.setBackgroundColor("#00000000");
  }else {
      mainWindow.setBackgroundColor("#00000000");
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

  mainWindow?.on("closed", () => {
    mainWindow = null;
  });


  return mainWindow;
}