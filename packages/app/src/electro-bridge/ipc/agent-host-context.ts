import type {
  AgentHostDispatch,
  AgentHostRendererResponse,
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
