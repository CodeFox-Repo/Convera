import type {
  AgentHostDispatch,
  AgentHostRendererResponse,
  AgentHostTaskAction,
} from "@/shared/types/agent-host";
import type { AgentHost } from "@/electron/agent-host/host";
import type { AgentHostRendererBridge } from "@/electron/agent-host/renderer-bridge";
import {
  ipcMain,
  type IpcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { AGENT_HOST_CHANNELS } from "./agent-host-api";
import { isAllowedLocalAISender } from "./local-ai-context";

export interface AgentHostIPCOptions {
  host?: AgentHost;
  bridge?: AgentHostRendererBridge;
  getAllowedWebContents: () => WebContents | WebContents[] | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function allowed(
  event: IpcMainInvokeEvent,
  options: AgentHostIPCOptions,
): boolean {
  return isAllowedLocalAISender(event, options.getAllowedWebContents());
}

export function setupAgentHostIPC(
  options: AgentHostIPCOptions,
  mainIPC: Pick<IpcMain, "handle" | "removeHandler"> = ipcMain,
): void {
  for (const channel of [
    AGENT_HOST_CHANNELS.ENQUEUE,
    AGENT_HOST_CHANNELS.READY,
    AGENT_HOST_CHANNELS.LIST_JOBS,
    AGENT_HOST_CHANNELS.LIST_TASKS,
    AGENT_HOST_CHANNELS.CONTROL_TASK,
    AGENT_HOST_CHANNELS.REDIRECT_TASK,
    AGENT_HOST_CHANNELS.RECORD_OUTPUT,
    AGENT_HOST_CHANNELS.CANCEL,
    AGENT_HOST_CHANNELS.RESPOND,
  ]) {
    mainIPC.removeHandler(channel);
  }

  mainIPC.handle(AGENT_HOST_CHANNELS.READY, async (event) => {
    if (!allowed(event, options)) {
      return { success: false, error: "Agent Host IPC sender is not allowed." };
    }
    if (!options.host) {
      return { success: false, error: "Agent Host is unavailable." };
    }
    options.host.start();
    return { success: true };
  });

  mainIPC.handle(
    AGENT_HOST_CHANNELS.ENQUEUE,
    async (event, dispatch: AgentHostDispatch) => {
      if (!allowed(event, options)) {
        return {
          success: false,
          error: "Agent Host IPC sender is not allowed.",
        };
      }
      if (!options.host) {
        return { success: false, error: "Agent Host is unavailable." };
      }
      try {
        return { success: true, jobs: await options.host.enqueue(dispatch) };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  );

  mainIPC.handle(AGENT_HOST_CHANNELS.LIST_JOBS, async (event) => {
    if (!allowed(event, options)) {
      return { success: false, error: "Agent Host IPC sender is not allowed." };
    }
    if (!options.host) {
      return { success: false, error: "Agent Host is unavailable." };
    }
    try {
      return { success: true, jobs: await options.host.listJobs() };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  });

  mainIPC.handle(
    AGENT_HOST_CHANNELS.LIST_TASKS,
    async (event, agentMemberId: unknown) => {
      if (!allowed(event, options)) {
        return {
          success: false,
          error: "Agent Host IPC sender is not allowed.",
        };
      }
      if (!options.host) {
        return { success: false, error: "Agent Host is unavailable." };
      }
      if (agentMemberId !== undefined && typeof agentMemberId !== "string") {
        return { success: false, error: "Agent member id must be a string." };
      }
      try {
        return {
          success: true,
          tasks: await options.host.listTasks(agentMemberId),
        };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  );

  mainIPC.handle(
    AGENT_HOST_CHANNELS.CONTROL_TASK,
    async (event, taskId: unknown, action: unknown) => {
      if (!allowed(event, options)) {
        return {
          success: false,
          error: "Agent Host IPC sender is not allowed.",
        };
      }
      if (!options.host) {
        return { success: false, error: "Agent Host is unavailable." };
      }
      if (typeof taskId !== "string" || !taskId) {
        return { success: false, error: "A task id is required." };
      }
      if (!isTaskAction(action)) {
        return {
          success: false,
          error: "Task action must be pause, resume, or cancel.",
        };
      }
      try {
        const changed =
          action === "pause"
            ? await options.host.pauseTask(taskId)
            : action === "resume"
              ? await options.host.resumeTask(taskId)
              : await options.host.cancelTask(taskId);
        return { success: true, changed };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  );

  mainIPC.handle(
    AGENT_HOST_CHANNELS.REDIRECT_TASK,
    async (event, taskId: unknown, instruction: unknown) => {
      if (!allowed(event, options)) {
        return {
          success: false,
          error: "Agent Host IPC sender is not allowed.",
        };
      }
      if (!options.host) {
        return { success: false, error: "Agent Host is unavailable." };
      }
      if (typeof taskId !== "string" || !taskId) {
        return { success: false, error: "A task id is required." };
      }
      if (typeof instruction !== "string") {
        return { success: false, error: "Task guidance must be a string." };
      }
      try {
        return {
          success: true,
          job: await options.host.redirectTask(taskId, instruction),
        };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  );

  mainIPC.handle(
    AGENT_HOST_CHANNELS.RECORD_OUTPUT,
    async (event, jobId: unknown, messageId: unknown) => {
      if (!allowed(event, options)) {
        return {
          success: false,
          error: "Agent Host IPC sender is not allowed.",
        };
      }
      if (!options.host) {
        return { success: false, error: "Agent Host is unavailable." };
      }
      if (typeof jobId !== "string" || !jobId) {
        return { success: false, error: "A job id is required." };
      }
      if (typeof messageId !== "string" || !messageId) {
        return { success: false, error: "A message id is required." };
      }
      try {
        return {
          success: true,
          recorded: await options.host.recordOutput(jobId, messageId),
        };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  );

  mainIPC.handle(AGENT_HOST_CHANNELS.CANCEL, async (event, jobId: unknown) => {
    if (!allowed(event, options)) {
      return { success: false, error: "Agent Host IPC sender is not allowed." };
    }
    if (!options.host) {
      return { success: false, error: "Agent Host is unavailable." };
    }
    if (typeof jobId !== "string" || !jobId) {
      return { success: false, error: "A job id is required." };
    }
    try {
      return {
        success: true,
        cancelled: await options.host.cancel(jobId),
      };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  });

  mainIPC.handle(
    AGENT_HOST_CHANNELS.RESPOND,
    async (event, response: AgentHostRendererResponse) => {
      if (!allowed(event, options)) {
        return {
          success: false,
          error: "Agent Host IPC sender is not allowed.",
        };
      }
      if (!options.bridge) {
        return { success: false, error: "Agent Host bridge is unavailable." };
      }
      return {
        success: true,
        accepted: options.bridge.respond(response),
      };
    },
  );
}

function isTaskAction(value: unknown): value is AgentHostTaskAction {
  return value === "pause" || value === "resume" || value === "cancel";
}
