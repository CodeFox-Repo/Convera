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

  useEffect(() => {
    void refresh();
    return () => {
      // This ref is a request sequence, not a DOM node. Invalidate any in-flight check.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++requestId.current;
    };
  }, [refresh]);

  return { providers, loading, error, refresh };
}
