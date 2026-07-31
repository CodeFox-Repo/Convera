import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { getLogger, initializeLogger } from "@/electron/logger";
import {
  callTool,
  getAllTools,
  getMCPHub,
  initializeMCPHub,
  mcpToolCall,
} from "@/electron/mcp";
import { LocalAiRuntime } from "@/electron/ai";
import { JsonSessionStateRepository } from "@/electron/ai/session/repository";
import {
  createElectronMemoryIntegration,
  type MemoryIntegrationCoordinator,
} from "@/electron/memory";

import { getCurrentShortcut } from "@/electro-bridge/ipc/ipc-handlers";

import {
  ListenerOptions,
  registerListeners,
} from "@/electro-bridge/ipc/listeners-register";
import {
  createWebBridgeEvent,
  createRecordingIpcMain,
} from "@/electron/web-bridge/dispatch";
import {
  isWebBridgeEnabled,
  startWebBridge,
  type WebBridgeHandle,
} from "@/electron/web-bridge/server";
import { createSystemTray, destroySystemTray } from "./tray";
import {
  createMainWindow,
  getMainWindow,
  isBackgroundAutomation,
  preCreateMainWindow,
} from "./windows/main-window";

// Initialize logger for main process
const logger = getLogger("main-process");
let localAIRuntime: LocalAiRuntime | undefined;
let memoryCoordinator: MemoryIntegrationCoordinator | undefined;
let webBridge: WebBridgeHandle | undefined;
let localAICleanup: Promise<void> | undefined;
let quitAfterCleanup = false;

function cleanupLocalAI(): Promise<void> {
  if (localAICleanup) return localAICleanup;
  localAICleanup = (async () => {
    await webBridge?.close().catch((error) => {
      logger.error("Web bridge cleanup failed:", error);
    });
    await localAIRuntime?.dispose().catch((error) => {
      logger.error("Local AI runtime cleanup failed:", error);
    });
    await memoryCoordinator?.dispose().catch((error) => {
      logger.error("Memory coordinator cleanup failed:", error);
    });
  })();
  return localAICleanup;
}

function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();

  if (isBackgroundAutomation()) {
    return;
  }

  const currentShortcut = getCurrentShortcut();

  // Don't register anything if no shortcut is set yet (renderer hasn't initialized)
  if (!currentShortcut) {
    console.log("No shortcut set yet, waiting for renderer initialization");
    return;
  }

  console.log(`Attempting to register global shortcut: ${currentShortcut}`);
  try {
    const ret = globalShortcut.register(currentShortcut, () => {
      // Show and focus main window
      const mainWindow = getMainWindow();
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
      } else {
        // Create main window if it doesn't exist
        createMainWindow();
      }
    });

    if (!ret) {
      console.error(
        `Failed to register global shortcut: ${currentShortcut}. It might be already in use.`,
      );
    } else {
      console.log(
        `Global shortcut ${currentShortcut} registered successfully.`,
      );
    }
  } catch (error) {
    console.error(
      `Error registering global shortcut ${currentShortcut}:`,
      error,
    );
  }
}

// Handle screen resize events - simplified for single window
function setupScreenResizeHandlers() {
  // No special handling needed for resizable single window
  // The window will handle resize naturally
}

app.whenReady().then(async () => {
  try {
    logger.info("Application ready, starting initialization");

    // Initialize synchronous components first
    initializeLogger();

    const userDataPath = app.getPath("userData");
    const sessionRepository = new JsonSessionStateRepository({
      path: join(userDataPath, "local-ai-runtime-state.json"),
    });
    memoryCoordinator = createElectronMemoryIntegration({
      userDataPath,
      workingDirectory: process.cwd(),
      sessionRepository,
    });
    localAIRuntime = new LocalAiRuntime({
      sessionRepository,
      turnHooks: memoryCoordinator,
      memoryService: memoryCoordinator,
      resolveSandbox: async (request) => {
        const agentId = request.agent?.id?.trim();
        if (!agentId) {
          const root = process.cwd();
          return {
            root,
            writableRoots: [root],
            networkAccess: false,
          };
        }

        // Hash the IPC identity before using it in a path. The main process,
        // not renderer-provided cwd, chooses this filesystem scope so an actor
        // cannot widen its own sandbox.
        const storageId = createHash("sha256").update(agentId).digest("hex");
        const root = join(userDataPath, "agents", storageId);
        const workspace = join(root, "workspace");
        await mkdir(workspace, { recursive: true });
        return {
          root,
          writableRoots: [workspace],
          networkAccess: false,
        };
      },
      getToolGroups: async () => {
        await initializeMCPHub();
        return getAllTools();
      },
      executeTool: (serverName, toolName, input) =>
        serverName.toLowerCase() === "builtin"
          ? mcpToolCall(toolName, input)
          : callTool(serverName, toolName, input),
    });

    // Initialize MCP Hub asynchronously but don't block startup
    initializeMCPHub()
      .then(() => {
        logger.info("MCP Hub initialization completed");
      })
      .catch((error) => {
        logger.error("MCP Hub initialization failed:", error);
      });

    // Start background processes that don't block UI
    registerGlobalShortcuts();
    setupScreenResizeHandlers();

    // Pre-create and show main window
    const mainWindow = preCreateMainWindow();
    if (mainWindow && !isBackgroundAutomation()) {
      mainWindow.show();
      mainWindow.focus();
    }

    const recordingIPC = isWebBridgeEnabled()
      ? createRecordingIpcMain(ipcMain)
      : undefined;

    // Set up options for the new unified listener system
    const listenerOptions: ListenerOptions = {
      mainWindow: () => getMainWindow(),
      registerGlobalShortcuts,
      localAIRuntime,
      ipc: recordingIPC,
      extraLocalAISenders: () =>
        (webBridge?.senders() ?? []).map((sender) => sender as never),
    };

    logger.debug("Registering IPC listeners");
    registerListeners(listenerOptions);

    if (recordingIPC) {
      webBridge = await startWebBridge({
        rendererURL: MAIN_WINDOW_VITE_DEV_SERVER_URL || undefined,
        invoke: (channel, args, sender) =>
          recordingIPC.dispatch(channel, args, createWebBridgeEvent(sender)),
      });
    }

    app.on("activate", () => {
      const mainWin = getMainWindow();
      if (mainWin) {
        if (!isBackgroundAutomation()) {
          mainWin.show();
          mainWin.focus();
        }
      } else if (BrowserWindow.getAllWindows().length === 0) {
        logger.info("App activated, creating main window");
        createMainWindow();
      }
    });

    createSystemTray();
  } catch (error) {
    logger.error("Error during app initialization", error);
  }
});

app.on("before-quit", (event) => {
  if (quitAfterCleanup) return;
  event.preventDefault();
  void cleanupLocalAI().finally(() => {
    quitAfterCleanup = true;
    app.quit();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  destroySystemTray();
  const hub = getMCPHub();
  if (hub) {
    hub.cleanup();
    console.log("MCP Hub cleaned up");
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && getMainWindow() === null) {
    app.quit();
  }
});
