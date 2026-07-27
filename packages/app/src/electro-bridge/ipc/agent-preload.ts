import type { AgentCoreOptions, ApprovalRequest } from "@convera/agent-core";
import type { IpcRenderer } from "electron";
import { AGENT_CHANNELS } from "./agent-channels";

/**
 * Renderer-facing half of the agent bridge.
 *
 * Kept apart from agent-context.ts on purpose: that file pulls in the Agent SDK, and the
 * preload bundle must not carry it. Only types cross this boundary, and types erase.
 */
export interface AgentAPI {
  send(
    turnId: string,
    prompt: string,
    options?: AgentCoreOptions,
  ): Promise<{ success: boolean; error?: string }>;
  stop(turnId: string): Promise<{ success: boolean; error?: string }>;
  respondToApproval(
    turnId: string,
    approvalId: string,
    granted: boolean,
  ): Promise<{ success: boolean }>;
  onMessage(cb: (payload: { turnId: string; message: unknown }) => void): () => void;
  onApprovalRequest(
    cb: (payload: ApprovalRequest & { turnId: string; approvalId: string }) => void,
  ): () => void;
}

export function createAgentAPI(ipcRenderer: IpcRenderer): AgentAPI {
  const subscribe = <T>(channel: string, cb: (payload: T) => void) => {
    const handler = (_event: unknown, payload: T) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };

  return {
    send: (turnId, prompt, options) =>
      ipcRenderer.invoke(AGENT_CHANNELS.SEND, { turnId, prompt, options }),
    stop: (turnId) => ipcRenderer.invoke(AGENT_CHANNELS.STOP, turnId),
    respondToApproval: (turnId, approvalId, granted) =>
      ipcRenderer.invoke(AGENT_CHANNELS.APPROVAL_RESPONSE, { turnId, approvalId, granted }),
    onMessage: (cb) => subscribe(AGENT_CHANNELS.MESSAGE, cb),
    onApprovalRequest: (cb) => subscribe(AGENT_CHANNELS.APPROVAL_REQUEST, cb),
  };
}
