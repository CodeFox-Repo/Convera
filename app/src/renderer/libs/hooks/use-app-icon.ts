import { useEffect, useState } from "react";

/**
 * Hook to fetch and cache app icons using the new sips-based icon system
 */
export function useAppIcon(appName?: string) {
  const [iconData, setIconData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Clear previous state when appName changes
    setIconData(null);
    setError(null);

    if (!appName || !appName.trim()) {
      setIsLoading(false);
      return;
    }

    // Skip known electron apps that we don't want to show icons for
    const ignoreList = ["Electron", "FoxyChat", "foxfoxy"];
    if (ignoreList.some((name) => appName.includes(name))) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const fetchIcon = async () => {
      try {
        if (!window.electronAPI?.getProcessIcon) {
          setError("getProcessIcon API not available");
          setIsLoading(false);
          return;
        }

        const result = await window.electronAPI.getProcessIcon(appName);

        if (result.success && result.iconData) {
          setIconData(result.iconData);
          setError(null);
        } else {
          setError(result.error || "Failed to get icon");
          setIconData(null);
        }
      } catch (err) {
        console.error(`useAppIcon: Error fetching icon for ${appName}:`, err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setIconData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchIcon();
  }, [appName]);

  return {
    iconData,
    isLoading,
    error,
    hasIcon: !!iconData,
  };
}
