import { ChildProcess, execFile, spawn } from "child_process";
import { app, BrowserWindow } from "electron";
import path from "path";
import { CHANNELS } from "./channels";

// State
let previousAppName = "";
let previousAppId = 0;

let swiftProcess: ChildProcess | null = null;
const contentUpdateCallbacks: ((content: string) => void)[] = [];

// Set to store apps that have been granted access
const accessGrantedApps = new Set<string>();

export function grantAccess(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // If app hasn't been granted access yet, run openAccess script first
    if (!accessGrantedApps.has(previousAppName)) {
      const projectRoot = app.isPackaged
        ? process.resourcesPath
        : app.getAppPath();
      const openAccessPath = path.join(
        projectRoot,
        "scripts",
        "openAccess.swift",
      );
      execFile("swift", [openAccessPath, previousAppName], (err) => {
        if (err) {
          console.error("Failed to grant access:", err);
          return reject(err);
        }
        accessGrantedApps.add(previousAppName);
        resolve(previousAppName);
      });
    } else {
      resolve(previousAppName);
    }
  });
}

export function startAppContentMonitoring(appName: string): void {
  if (swiftProcess) {
    swiftProcess.kill();
    swiftProcess = null;
  }

  console.log("monitoring : ", appName);

  const projectRoot = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const swiftScriptPath = path.join(projectRoot, "scripts", "Context.swift");
  swiftProcess = spawn("swift", [swiftScriptPath, appName], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer = "";

  swiftProcess.stdout?.on("data", (data: Buffer) => {
    buffer += data.toString();

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        try {
          const update = JSON.parse(line);
          if (update.type === "context_update") {
            contentUpdateCallbacks.forEach((callback) =>
              callback(update.content),
            );
            BrowserWindow.getAllWindows().forEach((win) => {
              if (!win.isDestroyed()) {
                win.webContents.send(CHANNELS.APP.CONTENT_UPDATED, update);
              }
            });
          }
        } catch (error) {
          console.error(error);
        }
      }
    }
  });

  swiftProcess.stderr?.on("data", (data: Buffer) => {
    console.error("Swift error:", data.toString());
  });

  swiftProcess.on("exit", (code) => {
    console.log(`Swift process exit, code: ${code}`);
    if (buffer.trim()) {
      try {
        const update = JSON.parse(buffer);
        if (update.type === "context_update") {
          contentUpdateCallbacks.forEach((callback) =>
            callback(update.content),
          );
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send(CHANNELS.APP.CONTENT_UPDATED, update);
            }
          });
        }
      } catch (error) {
        console.error(error);
      }
    }
    swiftProcess = null;
  });
}

export function stopAppContentMonitoring(): void {
  if (swiftProcess) {
    swiftProcess.kill();
    swiftProcess = null;
  }
}

export function onContentUpdate(
  callback: (content: string) => void,
): () => void {
  contentUpdateCallbacks.push(callback);
  return () => {
    const index = contentUpdateCallbacks.indexOf(callback);
    if (index > -1) {
      contentUpdateCallbacks.splice(index, 1);
    }
  };
}

export function setPreviousApp(appName: string, appId?: number): void {
  if (
    appName !== previousAppName ||
    (appId !== undefined && appId !== previousAppId)
  ) {
    previousAppName = appName;
    if (appId !== undefined) {
      previousAppId = appId;
    }

    if (appName) {
      grantAccess()
        .then(() => {
          console.log("finish granted access:", appName);
          startAppContentMonitoring(appName);
        })
        .catch((err) => {
          console.error("failed to grant access:", err);
        });
      console.log("granted apps: ", accessGrantedApps);
    }

    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(CHANNELS.APP.APP_CHANGED, appName, previousAppId);
      }
    });
  }
}

// API Methods
export function getPreviousApp(): string {
  return previousAppName;
}

export function getPreviousAppID(): number {
  return previousAppId;
}

export function getPlatform(): string {
  return process.platform;
}

// 添加全局状态管理

export function activatePreviousApp(): void {
  const prevApp = getPreviousApp();
  const prevAppId = getPreviousAppID();

  if (!prevApp) {
    console.log("No previous app detected, can't switch focus");
    return;
  }

  if (process.platform === "darwin") {
    execFile(
      "osascript",
      ["-e", `tell application "${prevApp}" to activate`],
      (error) => {
        if (error) {
          console.error(`Error activating ${prevApp}:`, error);
        }
      },
    );
  } else if (process.platform === "win32" && prevAppId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { windowManager } = require("node-window-manager");
      const windows = windowManager.getWindows();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const targetWindow = windows.find((w: any) => {
        if (prevAppId && w.processId === prevAppId) {
          return true;
        }
        const title = w.getTitle();
        return title && title.includes(prevApp);
      });

      if (targetWindow) {
        if (!targetWindow.isVisible()) {
          targetWindow.restore();
        }
        targetWindow.bringToTop();
      } else {
        console.warn(`Window for "${prevApp}" not found`);
      }
    } catch (error) {
      console.error("Error using window-manager:", error);
    }
  }
}

export function getOpenedApps(): Promise<string[]> {
  return new Promise((resolve) => {
    if (process.platform !== "darwin") {
      return resolve([]);
    }
    
    const script = `
      try
        tell application "System Events" to get name of every process whose background only is false
      on error
        return ""
      end try
    `;
    
    execFile("osascript", ["-e", script], (err, stdout) => {
      if (err) {
        return resolve([]);
      }
      
      const apps = stdout.trim().length > 0 ? stdout.trim().split(", ") : [];
      // Remove duplicates only
      const uniqueApps = [...new Set(apps)];
      resolve(uniqueApps);
    });
  });
}

export function getAppIcon(appName: string): Promise<string | null> {
  return new Promise((resolve) => {
    console.log(`🎨 getAppIcon called for: ${appName}`);
    
    if (process.platform !== "darwin") {
      console.log("❌ Not on macOS, returning null");
      return resolve(null);
    }
    
    const script = `
      try
        tell application "System Events"
          set appPath to POSIX path of (file of process "${appName}" as alias)
          return appPath
        end tell
      on error
        return ""
      end try
    `;
    
    console.log(`🍎 Getting app path for: ${appName}`);
    execFile("osascript", ["-e", script], (err, stdout) => {
      if (err) {
        console.error(`❌ Error getting app path for ${appName}:`, err);
        return resolve(null);
      }
      
      const appPath = stdout.trim();
      console.log(`📁 App path for ${appName}:`, appPath);
      
      if (!appPath || appPath === "") {
        console.log(`❌ No app path found for ${appName}`);
        return resolve(null);
      }
      
      // Get app icon using macOS APIs - try multiple common icon file names
      const iconScript = `
        try
          set possibleIcons to {"AppIcon.icns", "app.icns", "Icon.icns", "icon.icns"}
          set appPath to "${appPath}"
          set iconConverted to false
          
          repeat with iconName in possibleIcons
            try
              set iconPath to appPath & "/Contents/Resources/" & iconName
              tell application "System Events"
                if exists file iconPath then
                  set outputPath to "/tmp/app_icon_temp_${appName.replace(/\s+/g, '_')}.png"
                  do shell script "sips -s format png --out '" & outputPath & "' '" & iconPath & "'"
                  set iconConverted to true
                  return outputPath
                end if
              end tell
            end try
          end repeat
          
          if not iconConverted then
            return ""
          end if
        on error
          return ""
        end try
      `;
      
      console.log(`🎨 Converting icon for ${appName}...`);
      execFile("osascript", ["-e", iconScript], (iconErr, iconStdout) => {
        if (iconErr) {
          console.error(`❌ Error converting icon for ${appName}:`, iconErr);
          return resolve(null);
        }
        
        const iconPath = iconStdout.trim();
        console.log(`✅ Icon path for ${appName}:`, iconPath);
        resolve(iconPath || null);
      });
    });
  });
}
