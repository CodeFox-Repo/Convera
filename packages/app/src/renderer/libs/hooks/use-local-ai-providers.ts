import { useCallback, useEffect, useState } from "react";
import {
  getLocalAI,
  LOCAL_AI_PROVIDER_NAMES,
  type LocalAIProviderId,
  type LocalAIProviderStatus,
} from "../local-ai-contract";

const fallbackProviders = Object.entries(LOCAL_AI_PROVIDER_NAMES).map(
  ([id, name]) => ({
    id: id as LocalAIProviderId,
    name,
    kind: id as LocalAIProviderId,
    availability: "unavailable" as const,
  }),
);

export function useLocalAIProviders() {
  const [providers, setProviders] =
    useState<LocalAIProviderStatus[]>(fallbackProviders);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const localAI = getLocalAI();
    if (!localAI) {
      setProviders(fallbackProviders);
      setLoading(false);
      return;
    }

    try {
      const result = await localAI.listProviders();
      if (result.success && result.data) {
        setProviders(result.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { providers, loading, refresh };
}
