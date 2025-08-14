// Icon utility functions and cache management
// Shared between frontend and backend

export interface IconCacheEntry {
  iconData: string;
  timestamp: number;
}

export interface AppIconResult {
  success: boolean;
  iconData?: string;
  error?: string;
}

// Icon cache configuration
export const ICON_CACHE_CONFIG = {
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  maxEntries: 1000,
  batchSize: 10,
  cacheTimeout: 2000, // 2 seconds for running apps cache
};

// Common app paths for macOS
export const COMMON_APP_PATHS = [
  "/Applications",
  "/System/Applications", 
  "/System/Applications/Utilities",
];

// Common icon file names to search for
export const ICON_FILE_NAMES = [
  "AppIcon.icns",
  "icon.icns",
  "Icon.icns", 
  "app.icns",
];

// Error messages (English only)
export const ERROR_MESSAGES = {
  ICON_NOT_FOUND: "App icon file not found",
  ICON_LOAD_FAILED: "Failed to load app icon",
  INVALID_APP_NAME: "Invalid application name",
  SYSTEM_ERROR: "System error occurred",
  CACHE_ERROR: "Icon cache error",
  SIPS_ERROR: "Image conversion failed",
} as const;

// Helper function to validate app names
export function isValidAppName(appName: string): boolean {
  return typeof appName === 'string' && 
         appName.trim().length > 0 && 
         appName.length < 100; // Reasonable limit
}

// Helper function to sanitize app names for file operations
export function sanitizeAppName(appName: string): string {
  return appName.replace(/[^a-zA-Z0-9\s\-_.]/g, '').trim();
}

// Helper function to create error results
export function createErrorResult(error: string): AppIconResult {
  return {
    success: false,
    error,
  };
}

// Helper function to create success results  
export function createSuccessResult(iconData: string): AppIconResult {
  return {
    success: true,
    iconData,
  };
}