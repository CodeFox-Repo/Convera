import { useEffect, useState } from "react";
import { iconCache } from "@/renderer/libs/utils/icon-cache";
import { appListCache } from "@/renderer/libs/utils/app-list-cache";

/**
 * Hook to track the previously active application
 */
export interface PreviousAppContent {
  appName: string;
  content: string;
  timestamp: number;
  type: string;
  notification: string;
  currentURL?: string;
}
export function usePreviousApp() {
  const [previousApp, setPreviousApp] = useState<string>("");
  const [previousAppContent, setPreviousAppContent] = useState<string>();
  const [openedApps, setOpenedApps] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Function to fetch the previous active application
  const fetchPreviousApp = async () => {
    try {
      if (window.activeAppAPI) {
        const appName = await window.activeAppAPI.getPreviousApp();

        // Ignore self-referential applications
        const ignoreList = ["Electron", "FoxyChat", "foxfoxy"];
        if (appName && !ignoreList.some((name) => appName.includes(name))) {
          setPreviousApp(appName);
        }
      }
    } catch (error) {
      console.error("Error fetching previous app:", error);
    }
  };
  const fetchOpenedApps = async (forceRefresh = false) => {
    try {
      if (window.activeAppAPI) {
        // Check cache first (unless force refresh)
        if (!forceRefresh) {
          const cachedApps = appListCache.get();
          if (cachedApps) {
            setOpenedApps(cachedApps);
            return;
          }
        }

        // Cache miss or force refresh - fetch from API
        const apps = await window.activeAppAPI.getOpenedApps();

        // Update caches
        appListCache.set(apps);
        iconCache.cleanup(apps);

        setOpenedApps(apps);
        setIsInitialized(true);
      }
    } catch (error) {
      console.error("Error fetching opened apps:", error);
      setIsInitialized(true);
    }
  };

  useEffect(() => {
    const unsubscribe = window.activeAppAPI.onContentUpdate((newContent) => {
      const res = newContent as unknown as PreviousAppContent;
      if (res.appName === previousApp) {
        setPreviousAppContent(
          res.content + (res.currentURL ?? "[currentURL]" + res.currentURL),
        );
      }
    });
    return unsubscribe;
  }, [previousApp]);

  useEffect(() => {
    fetchOpenedApps();
  }, [previousApp]);

  // Set up periodic refresh for app list (very fast to catch app exits immediately)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchOpenedApps();
    }, 500); // Refresh every 500ms for faster app exit detection

    return () => clearInterval(interval);
  }, []);

  // Fetch previous app on component mount and setup event listener for app changes
  useEffect(() => {
    // Initialize preloaded icons cache first
    iconCache.initializePreloadedIcons();

    // Initial fetch
    fetchPreviousApp();
    // Also fetch opened apps initially with force refresh for instant response
    fetchOpenedApps(true);

    // Setup event listener for app changes
    if (window.electronAPI?.onAppChanged) {
      const unsubscribe = window.electronAPI.onAppChanged((appName: string) => {
        if (appName) {
          // Use same filtering logic for events
          const ignoreList = ["Electron", "FoxyChat", "foxfoxy"];
          if (!ignoreList.some((name) => appName.includes(name))) {
            setPreviousApp(appName);
          }
        }
      });

      return unsubscribe;
    }
  }, []);

  // Format the app name to keep it short
  const formatAppName = (name: string) => {
    if (!name) return "";

    // Remove file extensions if present
    const nameWithoutExt = name.replace(/\.\w+$/, "");

    // Limit to 12 characters
    if (nameWithoutExt.length > 12) {
      return nameWithoutExt.substring(0, 10) + "...";
    }

    return nameWithoutExt;
  };

  return {
    previousApp,
    formatAppName,
    fetchPreviousApp,
    previousAppContent,
    openedApps,
    isInitialized,
  };
}
