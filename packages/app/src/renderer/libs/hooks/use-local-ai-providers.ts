import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalAIProviderStatus } from "@/shared/types/local-ai";
import {
  getLocalAI,
  LOCAL_AI_PROVIDER_NAMES,
  type LocalAIProviderId,
} from "../local-ai";

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
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    const localAI = getLocalAI();

    try {
      if (!localAI) throw new Error("Provider connection unavailable");
      const result = await localAI.listProviders();
      if (!result.success || !result.data)
        throw new Error("Provider check failed");
      if (currentRequest === requestId.current) setProviders(result.data);
    } catch {
      if (currentRequest === requestId.current) {
        // Do not leave a stale “Ready” badge after a failed refresh.
        setProviders(fallbackProviders);
        setError(
          "Couldn’t check AI providers. Re-check providers or restart Convera.",
        );
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  const cancelPending = useCallback(() => {
    requestId.current += 1;
  }, []);

  useEffect(() => {
    void refresh();
    return cancelPending;
  }, [refresh, cancelPending]);

  return { providers, loading, error, refresh };
}
