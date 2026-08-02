// src/types/electron.d.ts

import { WindowSizeConfig } from "@/electron/windows/window-size";
import type { ILocalAIAPI } from "./local-ai";
import type { IMcpAPI } from "./mcp";
import type { IAgentHostAPI } from "./agent-host";
import type { StartupProviderId } from "../startup-provider";

// Enum for window types
export type WindowType = "settings" | "history" | "main" | "chat";

// Enum for theme modes
export type ThemeMode = "light" | "dark" | "system";

// Window control options
export interface WindowControlOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

// Simple Logger types
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (message: string, data?: unknown) => Promise<void>;
  info: (message: string, data?: unknown) => Promise<void>;
  warn: (message: string, data?: unknown) => Promise<void>;
  error: (message: string, data?: unknown) => Promise<void>;
}

export interface WindowLogger {
  getLogger: (name?: string) => Logger;
}

// Define the structure of the API exposed via contextBridge
export interface IElectronAPI {
  // Unified Window Control
  closeWindow: () => Promise<void>;

  // Global shortcuts
  updateGlobalShortcut: (shortcut: string) => Promise<boolean>;
  initGlobalShortcut: (shortcut: string) => Promise<boolean>;

  // App functionality
  getClipboardText: () => Promise<string>;
  setInputText: (text: string) => Promise<void>;
  getStartupProvider: () => StartupProviderId | null;

  // Unified Theme Control
  setTheme: (mode: ThemeMode) => Promise<string>;
  getCurrentTheme: () => Promise<string>;

  // Unified Window Management
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  resizeWindow: (
    width: number,
    height: number,
    preserveX?: boolean,
  ) => Promise<void>;
  resizeAndCenterWindow: (width: number, height: number) => Promise<void>;
  getCurrentWindowPosition: () => Promise<{ x: number; y: number }>;
  getCurrentWindowSize: (window: WindowSizeConfig) => Promise<{
    width: number;
    height: number;
  }>;

  // View Mode
  toggleViewMode: (expanded: boolean) => Promise<boolean>;

  // Model functionality
  modelSelected: (modelId: string) => Promise<boolean>;

  // File operations
  openPath: (path: string) => Promise<void>;

  // Process icon operations
  getProcessIcon: (appName: string) => Promise<{
    success: boolean;
    iconData?: string;
    error?: string;
  }>;

  // Event listeners (Main -> Renderer)
  onFocusChatInput: (callback: () => void) => () => void;
  onAgentListUpdated: (callback: () => void) => () => void;
  onSetInputContent: (
    callback: (content: { text?: string }) => void,
  ) => () => void;
  onThemeChanged: (callback: (theme: string) => void) => () => void;
  onNavigateToSettings: (callback: () => void) => () => void;
}

export interface IPlatformAPI {
  getPlatform: () => Promise<string>;
}

// Define the Environment API interface
export interface IEnvAPI {
  isProduction: () => boolean;
}

// Extend the global Window interface
declare global {
  interface Window {
    electronAPI: IElectronAPI;
    platformAPI: IPlatformAPI;
    mcpAPI: IMcpAPI;
    envApi: IEnvAPI;
    logger: WindowLogger;
    localAI: ILocalAIAPI;
    agentHost?: IAgentHostAPI;
  }
}
