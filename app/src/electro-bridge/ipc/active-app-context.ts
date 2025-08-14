import { ChildProcess, execFile, spawn, exec } from "child_process";
import { app, BrowserWindow } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { promisify } from "util";
import { CHANNELS } from "./channels";
import {
  BUILTIN_APP_ICONS as BUILTIN_ICONS,
  FALLBACK_APP_LIST,
  ERROR_MESSAGES,
  createErrorResult,
} from "@/renderer/assets/builtin-app-icons";

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
          startAppContentMonitoring(appName);
        })
        .catch((err) => {
          console.error("failed to grant access:", err);
        });
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

export async function getOpenedApps(): Promise<string[]> {
  // Check if cache is valid
  const now = Date.now();
  if (
    runningAppsCache.length > 0 &&
    now - runningAppsCacheTime < RUNNING_APPS_CACHE_DURATION
  ) {
    return [...runningAppsCache];
  }

  // Get fresh app list
  const apps = await getOpenedAppsFromSystem();

  // Only update cache when returning non-empty results
  if (apps.length > 0) {
    runningAppsCache = apps;
    runningAppsCacheTime = now;
  } else if (runningAppsCache.length > 0) {
    // If empty result but cache has data, return cache
    return [...runningAppsCache];
  }

  return apps;
}

// Icon cache system - preload all app icons
const iconCache = new Map<string, string>();
let iconCacheInitialized = false;

// Running apps cache - avoid frequent AppleScript calls
let runningAppsCache: string[] = [];
let runningAppsCacheTime = 0;
const RUNNING_APPS_CACHE_DURATION = 2000; // 2 second cache

// Preload app list and icons at startup
export async function preloadAllAppData(): Promise<void> {
  if (iconCacheInitialized) {
    return;
  }

  try {
    // Step 1: Get all possible application lists

    // Get running applications
    const runningApps = await getOpenedAppsFromSystem();

    // Initialize running apps cache
    if (runningApps.length > 0) {
      runningAppsCache = runningApps;
      runningAppsCacheTime = Date.now();
    }

    // Get all installed applications
    const installedApps = await getAllInstalledApps();

    // Merge and deduplicate all apps
    const allApps = [...new Set([...runningApps, ...installedApps])];

    // Step 2: Parallel preload all icons

    // Process in batches to avoid too many parallel requests
    const batchSize = 10;

    for (let i = 0; i < allApps.length; i += batchSize) {
      const batch = allApps.slice(i, i + batchSize);
      const batchPromises = batch.map(async (appName) => {
        try {
          const iconData = await loadAppIconFromDisk(appName);
          if (iconData) {
            iconCache.set(appName, iconData);
          }
        } catch {
          // Silent error handling to avoid excessive logging
        }
      });

      await Promise.all(batchPromises);
    }

    iconCacheInitialized = true;
  } catch (error) {
    console.error("Error during app data preloading:", error);
    iconCacheInitialized = true;
  }
}

// Get all installed applications
async function getAllInstalledApps(): Promise<string[]> {
  return new Promise((resolve) => {
    if (process.platform !== "darwin") {
      return resolve([]);
    }

    // Use find command to scan all .app files
    const command = `find /Applications /System/Applications -name "*.app" -type d -maxdepth 2 2>/dev/null | sed 's|.*/\\([^/]*\\)\\.app|\\1|' | sort -u`;

    exec(
      command,
      { maxBuffer: 10 * 1024 * 1024 },
      (err: unknown, stdout: unknown) => {
        if (err) {
          resolve(FALLBACK_APP_LIST);
        } else {
          const apps = (stdout as string)
            .trim()
            .split("\n")
            .filter((app: string) => app.length > 0);
          resolve(apps);
        }
      },
    );
  });
}

// Internal function to get app list from system
async function getOpenedAppsFromSystem(): Promise<string[]> {
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

      if (!stdout || stdout.trim().length === 0) {
        return resolve([]);
      }

      const apps = stdout
        .trim()
        .split(", ")
        .filter((app) => app.length > 0);

      resolve(apps);
    });
  });
}

// Core function to load app icon from disk
async function loadAppIconFromDisk(appName: string): Promise<string | null> {
  if (process.platform !== "darwin") {
    return null;
  }

  const execAsync = promisify(exec);

  const appPaths = [
    `/Applications/${appName}.app`,
    `/System/Applications/${appName}.app`,
    `/System/Applications/Utilities/${appName}.app`,
  ];

  for (const appPath of appPaths) {
    try {
      if (!fs.existsSync(appPath)) {
        continue;
      }

      const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
      const iconPaths = [];

      if (fs.existsSync(infoPlistPath)) {
        const plistContent = fs.readFileSync(infoPlistPath, "utf8");
        const iconMatch = plistContent.match(
          /<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/,
        );
        let iconFileName = iconMatch ? iconMatch[1] : null;

        if (!iconFileName) {
          const iconNameMatch = plistContent.match(
            /<key>CFBundleIconName<\/key>\s*<string>([^<]+)<\/string>/,
          );
          iconFileName = iconNameMatch ? iconNameMatch[1] : null;
        }

        if (iconFileName) {
          if (!iconFileName.endsWith(".icns")) {
            iconFileName += ".icns";
          }
          iconPaths.push(
            path.join(appPath, "Contents", "Resources", iconFileName),
          );
        }
      }

      iconPaths.push(
        path.join(appPath, "Contents", "Resources", "AppIcon.icns"),
        path.join(appPath, "Contents", "Resources", "icon.icns"),
        path.join(appPath, "Contents", "Resources", "Icon.icns"),
        path.join(appPath, "Contents", "Resources", "app.icns"),
      );

      // Try each icon path
      for (const iconPath of iconPaths) {
        if (fs.existsSync(iconPath)) {
          try {
            // Use sips to convert to PNG
            const tmpDir = os.tmpdir();
            const tmpPngPath = path.join(
              tmpDir,
              `${Date.now()}_${appName}_icon.png`,
            );

            const sipsCommand = `sips -s format png -z 32 32 "${iconPath}" --out "${tmpPngPath}"`;
            await execAsync(sipsCommand);

            if (fs.existsSync(tmpPngPath)) {
              const pngBuffer = fs.readFileSync(tmpPngPath);
              const base64Data = pngBuffer.toString("base64");
              const dataUrl = `data:image/png;base64,${base64Data}`;

              // Clean up temporary file
              fs.unlinkSync(tmpPngPath);

              return dataUrl;
            }
          } catch {
            continue;
          }
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function getAppIcon(appName: string): Promise<{
  success: boolean;
  iconData?: string;
  error?: string;
}> {
  try {
    // Check cache first
    if (iconCache.has(appName)) {
      return {
        success: true,
        iconData: iconCache.get(appName)!,
      };
    }

    // Check builtin icon mapping
    if (BUILTIN_ICONS[appName]) {
      const iconData = BUILTIN_ICONS[appName];
      // Cache builtin icon
      iconCache.set(appName, iconData);
      return {
        success: true,
        iconData: iconData,
      };
    }

    // Not in cache, try loading from disk
    const iconData = await loadAppIconFromDisk(appName);
    if (iconData) {
      // Store in cache for future use
      iconCache.set(appName, iconData);
      return {
        success: true,
        iconData: iconData,
      };
    }

    return createErrorResult(`${ERROR_MESSAGES.ICON_NOT_FOUND}: ${appName}`);
  } catch (error) {
    console.error("Error getting app icon:", error);
    return createErrorResult(
      `${ERROR_MESSAGES.ICON_LOAD_FAILED}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
