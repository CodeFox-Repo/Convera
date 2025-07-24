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
        : path.dirname(app.getAppPath());
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

  const projectRoot = app.isPackaged
    ? process.resourcesPath
    : path.dirname(app.getAppPath());
  const swiftScriptPath = path.join(projectRoot, "scripts", "Context.swift");

  swiftProcess = spawn("swift", [swiftScriptPath, appName], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer = "";

  swiftProcess.stdout?.on("data", (data: Buffer) => {
    buffer += data.toString();

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    console.log(lines);

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
        console.error("Error getting opened apps:", err);
        return resolve([]);
      }
      const apps = stdout.trim().length > 0 ? stdout.trim().split(", ") : [];
      resolve(apps);
    });
  });
}
