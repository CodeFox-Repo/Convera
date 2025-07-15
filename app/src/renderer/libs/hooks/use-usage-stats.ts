import { useState, useEffect } from "react";
import { getBaseUrl } from "@/renderer/libs/env";
import { User } from "@/renderer/types/auth";

export interface UsageStats {
  total: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  recent: {
    requests: number;
    tokens: number;
  };
  byModel: Array<{
    modelId: string;
    requests: number;
    tokens: number;
  }>;
  daily: Array<{
    date: string;
    requests: number;
    tokens: number;
  }>;
}

export function useUsageStats(user: User | null) {
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const loadUsageStats = async () => {
    if (!user) return;

    setLoadingStats(true);
    try {
      const response = await fetch(`${getBaseUrl()}/api/users/usage`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setUsageStats(data.usage);
      }
    } catch (error) {
      console.error("Failed to load usage stats:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  // Load usage statistics when user changes
  useEffect(() => {
    if (user) {
      loadUsageStats();
    }
  }, [user]);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  return {
    usageStats,
    loadingStats,
    loadUsageStats,
    formatNumber,
  };
}
