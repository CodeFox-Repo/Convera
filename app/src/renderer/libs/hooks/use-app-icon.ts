import { useEffect, useState } from "react";

/**
 * Hook to get app icon for a given app name
 */
export function useAppIcon(appName: string) {
  const [iconPath, setIconPath] = useState<string | null>(null);

  useEffect(() => {
    if (!appName) {
      setIconPath(null);
      return;
    }

    const fetchAppIcon = async () => {
      try {
        console.log(`🎨 Fetching icon for app: ${appName}`);
        if (window.activeAppAPI?.getAppIcon) {
          const icon = await window.activeAppAPI.getAppIcon(appName);
          console.log(`🎨 Icon result for ${appName}:`, icon);
          setIconPath(icon);
        } else {
          console.error("❌ window.activeAppAPI.getAppIcon is not available");
        }
      } catch (error) {
        console.error(`❌ Error fetching icon for ${appName}:`, error);
        setIconPath(null);
      }
    };

    fetchAppIcon();
  }, [appName]);

  return iconPath;
}