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
}
export function usePreviousApp() {
  const [previousApp, setPreviousApp] = useState<string>("");
  const [previousAppContent, setPreviousAppContent] =
    useState<PreviousAppContent>();
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
  useEffect(() => {
    console.log("previousApp", previousApp);
  }, [previousApp]);
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
      const res = newContent as unknown as PreviousAppContent;
      console.log("res", res);
      console.log("APP", res.appName);
      console.log("APP2", previousApp); // 现在会获取到最新值
      if (res.appName === previousApp) {
        setPreviousAppContent(res);
      }
    });

    console.log("listening onContentUpdate");
    return unsubscribe;
  }, [previousApp]); // 添加 previousApp 作为依赖

  useEffect(() => {
    console.log("previousAppContent", previousAppContent);
  }, [previousAppContent]);

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
