import { useEffect, useState } from "react";

interface UseAppIconReturn {
  iconData: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useAppIcon(appName?: string, pid?: number): UseAppIconReturn {
  const [iconData, setIconData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appName || !window.electronAPI) {
      setIconData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const fetchIcon = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await window.electronAPI.getProcessIcon(pid || 0, appName);
        
        if (result.success && result.iconData) {
          setIconData(result.iconData);
          setError(null);
        } else {
          setIconData(null);
          setError(result.error || "Failed to get app icon");
          console.log(`Failed to get icon for ${appName}:`, result.error);
        }
      } catch (err) {
        setIconData(null);
        setError(err instanceof Error ? err.message : "Unknown error");
        console.error(`Error fetching icon for ${appName}:`, err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchIcon();
  }, [appName, pid]);

  return {
    iconData,
    isLoading,
    error,
  };
}