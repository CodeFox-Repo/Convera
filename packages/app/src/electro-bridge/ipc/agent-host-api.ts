import type {
  AgentHostEvent,
  AgentHostRendererRequest,
  IAgentHostAPI,
} from "@/shared/types/agent-host";
import type { LocalAIRendererIPC } from "./local-ai-api";

export const AGENT_HOST_CHANNELS = {
  ENQUEUE: "agent-host:enqueue",
  READY: "agent-host:ready",
  LIST_JOBS: "agent-host:list-jobs",
  CANCEL: "agent-host:cancel",
  RESPOND: "agent-host:respond",
  REQUEST: "agent-host:request",
  EVENT: "agent-host:event",
} as const;

export function createAgentHostAPI(
  rendererIPC: LocalAIRendererIPC,
): IAgentHostAPI {
  const invoke = rendererIPC.invoke.bind(rendererIPC) as <T>(
    channel: string,
    ...args: unknown[]
  ) => Promise<T>;
  return {
    ready: () => invoke(AGENT_HOST_CHANNELS.READY),
    enqueue: (dispatch) => invoke(AGENT_HOST_CHANNELS.ENQUEUE, dispatch),
    listJobs: () => invoke(AGENT_HOST_CHANNELS.LIST_JOBS),
    cancel: (jobId) => invoke(AGENT_HOST_CHANNELS.CANCEL, jobId),
    respond: (response) => invoke(AGENT_HOST_CHANNELS.RESPOND, response),
    onRequest: (callback) => {
      const handler = (_event: unknown, request: AgentHostRendererRequest) =>
        callback(request);
      rendererIPC.on(AGENT_HOST_CHANNELS.REQUEST, handler);
      return () =>
        rendererIPC.removeListener(AGENT_HOST_CHANNELS.REQUEST, handler);
    },
    onEvent: (callback) => {
      const handler = (_event: unknown, event: AgentHostEvent) =>
        callback(event);
      rendererIPC.on(AGENT_HOST_CHANNELS.EVENT, handler);
      return () =>
        rendererIPC.removeListener(AGENT_HOST_CHANNELS.EVENT, handler);
    },
  };
}
