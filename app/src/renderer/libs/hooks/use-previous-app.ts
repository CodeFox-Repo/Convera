import { useEffect, useState } from "react";

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
  // Initialize from localStorage to avoid empty array causing Finder fallback
  const [openedApps, setOpenedApps] = useState<string[]>(() => {
    const cached = localStorage.getItem("cachedOpenedApps");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        return [];
      }
    }
    return [];
  });

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
  const fetchOpenedApps = async () => {
    try {
      if (window.activeAppAPI) {
        const apps = await window.activeAppAPI.getOpenedApps();

        // Only update when getting valid app list
        if (apps && apps.length > 0) {
          setOpenedApps(apps);
          // Cache to localStorage
          localStorage.setItem("cachedOpenedApps", JSON.stringify(apps));
        }
      } else {
        console.warn("usePreviousApp: window.activeAppAPI not available");
      }
    } catch (error) {
      console.error("usePreviousApp: Error fetching opened apps:", error);
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

  // Fetch previous app on component mount and setup event listener for app changes
  useEffect(() => {
    // Initial fetch - immediately preload app data
    fetchPreviousApp();
    fetchOpenedApps(); // Load app list immediately when component mounts

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

    // Increase limit to 20 characters
    if (nameWithoutExt.length > 20) {
      return nameWithoutExt.substring(0, 18) + "...";
    }

    return nameWithoutExt;
  };

  return {
    previousApp,
    formatAppName,
    fetchPreviousApp,
    previousAppContent,
    openedApps,
  };
}
