import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentHostJob } from "@/shared/types/agent-host";

export function useAgentHostJobs(channelId?: string) {
  const [jobs, setJobs] = useState<AgentHostJob[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const api = window.agentHost;
    if (!api) {
      setError("Background Agent Host is unavailable.");
      return;
    }
    let mounted = true;
    void api.listJobs().then((result) => {
      if (!mounted) return;
      if (result.success) setJobs(result.jobs ?? []);
      else setError(result.error || "Could not read background agent jobs.");
    });
    const dispose = api.onEvent((event) => {
      if (event.type !== "job") return;
      setJobs((current) => {
        const index = current.findIndex((job) => job.id === event.job.id);
        if (index === -1) return [...current, event.job];
        const next = [...current];
        next[index] = event.job;
        return next;
      });
    });
    return () => {
      mounted = false;
      dispose();
    };
  }, []);

  const visibleJobs = useMemo(
    () =>
      channelId ? jobs.filter((job) => job.channelId === channelId) : jobs,
    [channelId, jobs],
  );
  const activeJobs = useMemo(
    () =>
      visibleJobs.filter(
        (job) => job.status === "queued" || job.status === "running",
      ),
    [visibleJobs],
  );
  const cancel = useCallback(async (jobId: string) => {
    const result = await window.agentHost?.cancel(jobId);
    if (!result?.success) {
      setError(result?.error || "Could not stop background agent work.");
    }
    return result?.cancelled === true;
  }, []);

  return { jobs: visibleJobs, activeJobs, error, cancel };
}
