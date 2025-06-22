/**
 * Renderer-side synchronous environment API
 * This provides immediate access to environment information without IPC calls
 */

import {
  getBaseUrl as getBaseUrlSync,
  inDevelopment,
  isProduction as isProductionSync,
} from "@/shared/constants/dev";

/**
 * Synchronous environment API for renderer process
 * This replaces the async window.envApi with immediate access
 */
export const envApi = {
  /**
   * Check if running in production mode (synchronous)
   */
  isProduction: (): boolean => {
    return isProductionSync;
  },

  /**
   * Check if running in development mode (synchronous)
   */
  inDevelopment: (): boolean => {
    return inDevelopment;
  },

  /**
   * Get base URL (synchronous)
   */
  getBaseUrl: (): string => {
    return getBaseUrlSync();
  },

  /**
   * Get API URL (synchronous)
   */
  getApiUrl: (): string => {
    return `${getBaseUrlSync()}/api`;
  },

  /**
   * Get chat API URL (synchronous)
   */
  getChatApiUrl: (): string => {
    return `${getBaseUrlSync()}/api/chat/completion`;
  },
};

// For compatibility, expose as window.envApi
if (typeof window !== "undefined") {
  window.envApi = envApi;
}
