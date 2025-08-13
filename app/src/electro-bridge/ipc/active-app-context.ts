import { ChildProcess, execFile, spawn, exec } from "child_process";
import { app, BrowserWindow } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { promisify } from "util";
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

export async function getOpenedApps(): Promise<string[]> {
  // 检查缓存是否有效
  const now = Date.now();
  if (runningAppsCache.length > 0 && now - runningAppsCacheTime < RUNNING_APPS_CACHE_DURATION) {
    console.log(`⚡ Returning cached running apps: ${runningAppsCache.length} apps`);
    return [...runningAppsCache];
  }

  // 获取新的应用列表
  console.log("⚡ Getting currently running apps with preloaded icons...");
  const apps = await getOpenedAppsFromSystem();
  
  // 只有当返回非空结果时才更新缓存
  if (apps.length > 0) {
    runningAppsCache = apps;
    runningAppsCacheTime = now;
    console.log(`📱 Updated running apps cache: ${apps.length} apps`);
  } else if (runningAppsCache.length > 0) {
    // 如果返回空结果但缓存有数据，返回缓存
    console.log("⚠️ AppleScript returned empty, using cached apps");
    return [...runningAppsCache];
  }
  
  return apps;
}

// 图标缓存系统 - 预加载所有应用图标
const iconCache = new Map<string, string>();
let iconCacheInitialized = false;

// 应用列表缓存 - 启动时预加载
let cachedAppList: string[] = [];

// 运行中应用缓存 - 避免频繁调用 AppleScript
let runningAppsCache: string[] = [];
let runningAppsCacheTime = 0;
const RUNNING_APPS_CACHE_DURATION = 2000; // 2秒缓存

// 启动时预加载应用列表和图标
export async function preloadAllAppData(): Promise<void> {
  if (iconCacheInitialized) {
    console.log("⚡ App data already preloaded, skipping...");
    return;
  }

  console.log("🚀 Starting comprehensive app data preloading...");

  try {
    // 第一步：获取所有可能的应用列表
    console.log("📱 Step 1: Scanning all applications...");

    // 获取运行中的应用
    const runningApps = await getOpenedAppsFromSystem();
    console.log(`✅ Found ${runningApps.length} running apps:`, runningApps);
    
    // 初始化运行中应用缓存
    if (runningApps.length > 0) {
      runningAppsCache = runningApps;
      runningAppsCacheTime = Date.now();
    }

    // 获取所有已安装的应用
    const installedApps = await getAllInstalledApps();
    console.log(`✅ Found ${installedApps.length} installed apps`);

    // 合并并去重所有应用
    const allApps = [...new Set([...runningApps, ...installedApps])];
    cachedAppList = allApps;
    console.log(`🎯 Total unique apps to cache: ${allApps.length}`);
    console.log(
      `📋 Sample apps:`,
      allApps.slice(0, 15),
      allApps.length > 15 ? "..." : "",
    );

    // 第二步：并行预加载所有图标
    console.log("🎨 Step 2: Preloading ALL app icons...");

    // 分批处理，避免太多并行请求
    const batchSize = 10;
    let processed = 0;

    for (let i = 0; i < allApps.length; i += batchSize) {
      const batch = allApps.slice(i, i + batchSize);
      const batchPromises = batch.map(async (appName) => {
        try {
          const iconData = await loadAppIconFromDisk(appName);
          if (iconData) {
            iconCache.set(appName, iconData);
            processed++;
            if (processed % 5 === 0) {
              console.log(
                `🔄 Progress: ${processed}/${allApps.length} icons cached`,
              );
            }
          }
        } catch {
          // 静默处理错误，避免日志过多
        }
      });

      await Promise.all(batchPromises);
    }

    iconCacheInitialized = true;
    console.log(
      `🎉 COMPLETE! Cached ${cachedAppList.length} apps, ${iconCache.size} icons loaded!`,
    );
  } catch (error) {
    console.error("❌ Error during app data preloading:", error);
    iconCacheInitialized = true;
  }
}

// 获取所有已安装应用的函数
async function getAllInstalledApps(): Promise<string[]> {
  return new Promise((resolve) => {
    if (process.platform !== "darwin") {
      return resolve([]);
    }

    // 使用find命令扫描所有.app文件
    const command = `find /Applications /System/Applications -name "*.app" -type d -maxdepth 2 2>/dev/null | sed 's|.*/\\([^/]*\\)\\.app|\\1|' | sort -u`;

    exec(
      command,
      { maxBuffer: 10 * 1024 * 1024 },
      (err: unknown, stdout: unknown) => {
        if (err) {
          console.log(
            "⚠️ Error scanning installed apps, using comprehensive fallback list",
          );
          // 返回大量常见应用作为fallback
          resolve([
            // 系统应用
            "Finder",
            "System Preferences",
            "System Settings",
            "Activity Monitor",
            "Terminal",
            "Console",
            "Keychain Access",
            "Migration Assistant",
            "Boot Camp Assistant",

            // 浏览器
            "Safari",
            "Google Chrome",
            "Chrome",
            "Firefox",
            "Arc",
            "Microsoft Edge",
            "Edge",
            "Opera",
            "Brave Browser",

            // 办公软件
            "Microsoft Word",
            "Microsoft Excel",
            "Microsoft PowerPoint",
            "Microsoft Outlook",
            "Pages",
            "Numbers",
            "Keynote",
            "LibreOffice",
            "OpenOffice",

            // 开发工具
            "Visual Studio Code",
            "Code",
            "Xcode",
            "IntelliJ IDEA",
            "PyCharm",
            "WebStorm",
            "Sublime Text",
            "Atom",
            "Vim",
            "Emacs",
            "iTerm",
            "iTerm2",
            "Terminal",

            // 设计工具
            "Adobe Photoshop",
            "Photoshop",
            "Adobe Illustrator",
            "Illustrator",
            "Adobe After Effects",
            "After Effects",
            "Adobe Premiere Pro",
            "Premiere Pro",
            "Sketch",
            "Figma",
            "Canva",
            "Affinity Designer",
            "Affinity Photo",
            "Pixelmator Pro",
            "GIMP",

            // 通信协作
            "Slack",
            "Discord",
            "Microsoft Teams",
            "Teams",
            "Zoom",
            "Skype",
            "WhatsApp",
            "Telegram",
            "Signal",
            "WeChat",

            // 生产力
            "Notion",
            "Obsidian",
            "Evernote",
            "OneNote",
            "Bear",
            "Ulysses",
            "Typora",
            "Markdown Editor",
            "TaskPaper",
            "Things 3",
            "Todoist",
            "Any.do",

            // 媒体
            "Music",
            "TV",
            "Photos",
            "QuickTime Player",
            "VLC",
            "IINA",
            "Plex",
            "Spotify",
            "Apple Music",
            "SoundCloud",
            "YouTube Music",

            // 实用工具
            "1Password",
            "Bitwarden",
            "CleanMyMac",
            "CleanMyMac X",
            "The Unarchiver",
            "Keka",
            "AppCleaner",
            "Disk Utility",
            "Preview",
            "TextEdit",
            "Notes",
            "Calculator",
            "Calendar",
            "Contacts",
            "Reminders",
            "Mail",
            "FaceTime",
            "Messages",

            // 启动器和工具
            "Raycast",
            "Alfred",
            "LaunchBar",
            "Spotlight",
            "PopClip",
            "BetterTouchTool",
            "Karabiner-Elements",
            "Rectangle",
            "Magnet",

            // 云存储
            "Dropbox",
            "Google Drive",
            "OneDrive",
            "iCloud",
            "Box",
            "Sync.com",
            "pCloud",
          ]);
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

// 从系统获取应用列表的内部函数
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
        console.error("❌ Error getting opened apps:", err);
        return resolve([]);
      }

      console.log("🔍 AppleScript raw output:", stdout);

      if (!stdout || stdout.trim().length === 0) {
        console.warn("⚠️ AppleScript returned empty result");
        return resolve([]);
      }

      const apps = stdout
        .trim()
        .split(", ")
        .filter((app) => app.length > 0);
      
      console.log(`✅ getOpenedAppsFromSystem: Found ${apps.length} apps:`, apps);
      resolve(apps);
    });
  });
}

// 从磁盘加载应用图标的核心函数
async function loadAppIconFromDisk(appName: string): Promise<string | null> {
  if (process.platform !== "darwin") {
    return null;
  }

  const execAsync = promisify(exec);

  // 常见应用路径
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

      // 寻找图标文件
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

      // 添加常见图标名
      iconPaths.push(
        path.join(appPath, "Contents", "Resources", "AppIcon.icns"),
        path.join(appPath, "Contents", "Resources", "icon.icns"),
        path.join(appPath, "Contents", "Resources", "Icon.icns"),
        path.join(appPath, "Contents", "Resources", "app.icns"),
      );

      // 尝试每个图标路径
      for (const iconPath of iconPaths) {
        if (fs.existsSync(iconPath)) {
          try {
            // 使用sips转换为PNG
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

              // 清理临时文件
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
    // 先检查缓存
    if (iconCache.has(appName)) {
      return {
        success: true,
        iconData: iconCache.get(appName)!,
      };
    }

    // 缓存中没有，尝试即时加载
    const iconData = await loadAppIconFromDisk(appName);
    if (iconData) {
      // 存入缓存以备后用
      iconCache.set(appName, iconData);
      return {
        success: true,
        iconData: iconData,
      };
    }

    return {
      success: false,
      error: `无法找到应用图标文件: ${appName}`,
    };
  } catch (error) {
    console.error("❌ Error getting app icon:", error);
    return {
      success: false,
      error: `获取图标失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
