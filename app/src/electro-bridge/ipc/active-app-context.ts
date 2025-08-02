import { ChildProcess, execFile, spawn } from "child_process";
import { app, BrowserWindow } from "electron";
import path from "path";
import { CHANNELS } from "./channels";

// State
let previousAppName = "";
let previousAppId = 0;

// Main process icon cache for preloaded icons
const preloadedIconCache = new Map<string, string | null>();

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

    const attemptGetApps = (retryCount = 0) => {
      const script = `
        try
          tell application "System Events" to get name of every process whose background only is false
        on error
          return ""
        end try
      `;
      execFile("osascript", ["-e", script], (err, stdout) => {
        if (err) {
          console.error("❌ Error getting opened apps:", err);
          return resolve([]);
        }
        const apps = stdout.trim().length > 0 ? stdout.trim().split(", ") : [];

        // Filter out system processes and duplicates
        const filteredApps = apps.filter((app) => {
          // Filter out common system processes that shouldn't be in the list
          const systemProcesses = [
            "osascript",
            "System Events",
            "Accessibility Inspector",
            "loginwindow",
            "WindowServer",
            "Dock",
            "Finder Helper",
            "SystemUIServer",
            "ControlCenter",
            "Spotlight",
            "coreaudiod",
            // Also filter out FoxyChat itself
            "FoxyChat",
            "Electron",
          ];
          return !systemProcesses.includes(app);
        });
        const uniqueApps = [...new Set(filteredApps)];

        // If no apps found and we haven't retried yet, try once more
        if (uniqueApps.length === 0 && retryCount < 1) {
          // Retry silently
          setTimeout(() => attemptGetApps(retryCount + 1), 100);
          return;
        }

        resolve(uniqueApps);
      });
    };

    attemptGetApps();
  });
}

export function getAppIcon(appName: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform !== "darwin") {
      console.log("❌ Icon extraction only supported on macOS");
      return resolve(null);
    }

    // Filter out system processes early to avoid unnecessary processing
    const systemProcesses = [
      "osascript",
      "System Events",
      "Accessibility Inspector",
      "loginwindow",
      "WindowServer",
      "Dock",
      "Finder Helper",
      "SystemUIServer",
      "ControlCenter",
      "Spotlight",
      "coreaudiod",
    ];

    if (systemProcesses.includes(appName)) {
      console.log(`⏭️ Skipping system process: ${appName}`);
      return resolve(null);
    }

    // console.log(`🔍 Looking for icon for app: ${appName}`);

    // First, find the app path using fixed AppleScript syntax
    const script = `tell application "System Events" to get POSIX path of (file of (first process whose name is "${appName}"))`;

    execFile("osascript", ["-e", script], (err, stdout) => {
      if (err) {
        console.error(`❌ Error finding app path for ${appName}:`, err);
        return resolve(null);
      }

      const appPath = stdout.trim();
      if (!appPath) {
        console.log(`❌ No app path found for ${appName}`);
        return resolve(null);
      }

      // console.log(`📍 Found app path: ${appPath}`);

      // Use NSWorkspace API directly (no need to check for .icns files since we always use API)

      // Use NSWorkspace API for all cases (handles both .icns and system icons)
      // if (foundIcnsFile) {
      //   console.log(`📄 Found .icns file, will use NSWorkspace API to convert it...`);
      // } else {
      //   console.log(`❌ No .icns file found for ${appName} in Resources directory`);
      //   console.log(`🔄 Trying NSWorkspace API fallback...`);
      // }

      // Use Swift script to get icon via NSWorkspace API (direct base64 output)
      const projectRoot = app.isPackaged
        ? process.resourcesPath
        : app.getAppPath();
      const swiftScriptPath = path.join(
        projectRoot,
        "scripts",
        "GetAppIconBase64.swift",
      );

      execFile(
        "swift",
        [swiftScriptPath, appPath],
        { maxBuffer: 5 * 1024 * 1024 },
        (swiftErr, swiftStdout, swiftStderr) => {
          if (swiftErr) {
            console.error(`❌ Swift script error for ${appName}:`, swiftErr);
            console.error("Swift stderr:", swiftStderr);
            return resolve(null);
          }

          // Parse the output to get base64 data URL
          if (swiftStdout && swiftStdout.includes("SUCCESS:")) {
            const dataUrl = swiftStdout.replace("SUCCESS:", "").trim();
            // console.log(`✅ NSWorkspace API icon created for ${appName}`);
            return resolve(dataUrl);
          } else {
            console.log(
              `❌ NSWorkspace API failed to create icon for ${appName}`,
            );
            if (swiftStderr) {
              console.error("Swift stderr:", swiftStderr);
            }
            return resolve(null);
          }
        },
      );
    });
  });
}

// Preload function to warm up app list cache on startup
export function preloadAppList(): void {
  if (process.platform === "darwin") {
    // Start preloading in background without blocking startup
    setTimeout(() => {
      getOpenedApps()
        .then(async (apps) => {
          console.log(`🚀 Preloaded ${apps.length} apps`);

          // Preload icons for all available apps (optimized for small app lists)
          console.log(`🎨 Preloading icons for ${apps.length} apps...`);

          // Preload icons for all apps since the list is typically small
          const iconPromises = apps.map((appName) =>
            getAppIcon(appName)
              .then((iconData) => {
                preloadedIconCache.set(appName, iconData);
                return { appName, iconData };
              })
              .catch(() => {
                preloadedIconCache.set(appName, null);
                return { appName, iconData: null };
              }),
          );

          // Wait for all icons to finish loading
          Promise.all(iconPromises).then((results) => {
            const loadedCount = results.filter(
              (r) => r.iconData !== null,
            ).length;
            console.log(`🎨 Preloaded ${loadedCount}/${results.length} icons`);
          });
        })
        .catch(() => {
          // Preload failed, non-critical
        });
    }, 1000); // Small delay to let app finish startup
  }
}

// Get preloaded icons for renderer process
export function getPreloadedIcons(): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const [appName, iconData] of preloadedIconCache.entries()) {
    result[appName] = iconData;
  }
  return result;
}
