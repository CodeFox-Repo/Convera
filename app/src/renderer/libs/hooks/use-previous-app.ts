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
        }
      }
    } catch (error) {
      console.error("Error fetching previous app:", error);
    }
  };
  const fetchOpenedApps = async () => {
    try {
      if (window.activeAppAPI) {
        console.log("🔄 usePreviousApp: Fetching opened apps...");
        const apps = await window.activeAppAPI.getOpenedApps();
        console.log(
          `✅ usePreviousApp: Got ${apps.length} apps:`,
          apps.slice(0, 10),
        ); // Show first 10 apps
        setOpenedApps(apps);
        console.log("🔍 usePreviousApp: State updated with apps");
      } else {
        console.warn("⚠️ usePreviousApp: window.activeAppAPI not available");
      }
    } catch (error) {
      console.error("❌ usePreviousApp: Error fetching opened apps:", error);
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
    // Initial fetch - 立即预加载应用数据
    fetchPreviousApp();
    fetchOpenedApps(); // 组件mount时立即加载应用列表

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
  };
}
