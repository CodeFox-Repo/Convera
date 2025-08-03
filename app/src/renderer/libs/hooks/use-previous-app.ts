import { useEffect, useRef, useState } from "react";

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
  const previousAppRef = useRef<string>("");
  const previousAppContentRef = useRef<PreviousAppContent>(undefined);
  const contentUpdatedRef = useRef<boolean>(false);
  const [openedApps, setOpenedApps] = useState<string[]>([]);

  // Function to fetch the previous active application
  const fetchPreviousApp = async () => {
    try {
      if (window.activeAppAPI) {
        const appName = await window.activeAppAPI.getPreviousApp();

        // Ignore self-referential applications
        const ignoreList = ["Electron", "FoxyChat", "foxfoxy"];
        if (appName && !ignoreList.some((name) => appName.includes(name))) {
          setPreviousApp(appName);
          previousAppRef.current = appName;
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
        setOpenedApps(apps);
      }
    } catch (error) {
      console.error("Error fetching opened apps:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = window.activeAppAPI.onContentUpdate((newContent) => {
      contentUpdatedRef.current = false;
      const res = newContent as unknown as PreviousAppContent;
      if (res.appName === previousAppRef.current) {
        previousAppContentRef.current = res;
        contentUpdatedRef.current = true;
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    fetchOpenedApps();
  }, [previousApp]);

  // Fetch previous app on component mount and setup event listener for app changes
  useEffect(() => {
    // Initial fetch
    fetchPreviousApp();

    // Setup event listener for app changes
    if (window.electronAPI?.onAppChanged) {
      const unsubscribe = window.electronAPI.onAppChanged((appName: string) => {
        if (appName) {
          // Use same filtering logic for events
          const ignoreList = ["Electron", "FoxyChat", "foxfoxy"];
          if (!ignoreList.some((name) => appName.includes(name))) {
            setPreviousApp(appName);
            previousAppRef.current = appName;
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

    return nameWithoutExt;
  };

  return {
    previousApp,
    previousAppRef,
    formatAppName,
    fetchPreviousApp,
    previousAppContentRef,
    contentUpdatedRef,
    openedApps,
  };
}
