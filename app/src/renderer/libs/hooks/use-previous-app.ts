import { useEffect, useState } from "react";

/**
 * Hook to track the previously active application
 */
export function usePreviousApp() {
  const [previousApp, setPreviousApp] = useState<string>("");
  const [previousAppContent, setPreviousAppContent] = useState<string>();

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
    // Initial fetch
    const fetchContent = async () => {
      const content = await window.activeAppAPI.getPreviousAppContent();
      console.log("Previous app content:", content);
      setPreviousAppContent(content);
    };
    fetchContent();
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
  };
}
