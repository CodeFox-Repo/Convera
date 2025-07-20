import { load } from "cheerio";
import { exec } from "child_process";
import { BrowserWindow } from "electron";
import { CHANNELS } from "./channels";

// State
let previousAppName = "";
let previousAppId = 0;

// HTML/Content filtering
export enum appType {
  WebBrowser = "web-browser",
  Safari = "safari",
}

export const filterHtmlContent = (html: string): string => {
  const $ = load(html);
  $("script,style,noscript").remove();
  return $.root()
    .text()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
};

export const appNameList: Record<
  appType,
  {
    appList: string[];
    appleScript: (appName: string) => string;
    filter: (content: string) => string;
  }
> = {
  [appType.WebBrowser]: {
    appList: ["Microsoft Edge", "Google Chrome", "Mozilla Firefox"],
    appleScript: (appName) => `osascript -e 'tell application "${appName}"' \
             -e 'execute front window'\\''s active tab javascript "document.documentElement.outerHTML"' \
             -e 'end tell'`,
    filter: (content) => filterHtmlContent(content),
  },
  [appType.Safari]: {
    appList: ["Safari"],
    appleScript: (appName) =>
      `osascript -e 'tell application "${appName}" to return source of front document'`,
    filter: (content) => filterHtmlContent(content),
  },
};

export let resultHandleScript: (content: string) => string = (content) =>
  content;

export const appleCommand = (appName: string): string => {
  for (const appTypeKey in appNameList) {
    const appTypeValue = appNameList[appTypeKey as keyof typeof appNameList];
    if (appTypeValue.appList.includes(appName)) {
      resultHandleScript = appTypeValue.filter;
      return appTypeValue.appleScript(appName);
    }
  }
  return "";
};

// API Methods
export function getPreviousApp(): string {
  return previousAppName;
}

export function getPreviousAppContent(): Promise<string> {
  return new Promise((resolve) => {
    const command = appleCommand(previousAppName);
    if (!command) {
      return resolve("");
    }
    exec(command, { maxBuffer: 100 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        console.error("Error getting app content:", err);
        return resolve("");
      }
      const res =
        stdout && resultHandleScript ? resultHandleScript(stdout) : "";
      resolve(res);
    });
  });
}

export function getPreviousAppID(): number {
  return previousAppId;
}

export function getPlatform(): string {
  return process.platform;
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
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(CHANNELS.APP.APP_CHANGED, appName, previousAppId);
      }
    });
  }
}

export function activatePreviousApp(): void {
  const prevApp = getPreviousApp();
  const prevAppId = getPreviousAppID();

  if (!prevApp) {
    console.log("No previous app detected, can't switch focus");
    return;
  }

  if (process.platform === "darwin") {
    exec(
      `osascript -e 'tell application "${prevApp}" to activate'`,
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
