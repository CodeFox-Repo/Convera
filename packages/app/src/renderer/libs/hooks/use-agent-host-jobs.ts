import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentHostJob } from "@/shared/types/agent-host";
import type {
  AgentHostTaskAction,
  AgentHostTaskSummary,
} from "@/shared/types/agent-host";

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

export function useAgentHostTasks(agentMemberId?: string) {
  const [tasks, setTasks] = useState<AgentHostTaskSummary[]>([]);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    const result = await window.agentHost?.listTasks(agentMemberId);
    if (!result?.success) {
      setError(result?.error || "Could not read agent tasks.");
      return;
    }
    setError(undefined);
    setTasks(result.tasks ?? []);
  }, [agentMemberId]);

  useEffect(() => {
    const api = window.agentHost;
    if (!api) {
      setError("Background Agent Host is unavailable.");
      return;
    }
    void refresh();
    const dispose = api.onEvent((event) => {
      if (event.type !== "job") return;
      if (agentMemberId && event.job.agentMemberId !== agentMemberId) return;
      void refresh();
    });
    return dispose;
  }, [agentMemberId, refresh]);

  const control = useCallback(
    async (taskId: string, action: AgentHostTaskAction) => {
      const result = await window.agentHost?.controlTask(taskId, action);
      if (!result?.success || !result.changed) {
        setError(
          result?.error ||
            `The task could not ${action} from its current state.`,
        );
        return false;
      }
      await refresh();
      return true;
    },
    [refresh],
  );

  const redirect = useCallback(
    async (taskId: string, instruction: string) => {
      const result = await window.agentHost?.redirectTask(taskId, instruction);
      if (!result?.success || !result.job) {
        setError(result?.error || "Could not redirect the task.");
        return false;
      }
      await refresh();
      return true;
    },
    [refresh],
  );

  return { tasks, error, control, redirect, refresh };
}
