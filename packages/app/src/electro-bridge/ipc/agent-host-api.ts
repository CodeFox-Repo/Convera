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
  LIST_TASKS: "agent-host:list-tasks",
  CONTROL_TASK: "agent-host:control-task",
  REDIRECT_TASK: "agent-host:redirect-task",
  RECORD_OUTPUT: "agent-host:record-output",
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
    listTasks: (agentMemberId) =>
      invoke(AGENT_HOST_CHANNELS.LIST_TASKS, agentMemberId),
    controlTask: (taskId, action) =>
      invoke(AGENT_HOST_CHANNELS.CONTROL_TASK, taskId, action),
    redirectTask: (taskId, instruction) =>
      invoke(AGENT_HOST_CHANNELS.REDIRECT_TASK, taskId, instruction),
    recordOutput: (jobId, messageId) =>
      invoke(AGENT_HOST_CHANNELS.RECORD_OUTPUT, jobId, messageId),
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
