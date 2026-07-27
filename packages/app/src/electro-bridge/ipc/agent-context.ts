import { run, type AgentCoreOptions, type ApprovalRequest } from "@convera/agent-core";
import { BrowserWindow, ipcMain } from "electron";
import { AGENT_CHANNELS } from "./agent-channels";

/**
 * Bridge between the renderer's chat UI and the local agent loop.
 *
 * Deliberately not the ai-sdk data-stream shape the old remote endpoint spoke. That
 * protocol has no way to express "the agent wants to click something, block until the
 * human answers", and an approval gate is the whole reason this app can be trusted with
 * a mouse. So the renderer consumes agent messages as events instead.
 */

interface Session {
  abort: AbortController;
  pending: Map<string, (granted: boolean) => void>;
}

const sessions = new Map<string, Session>();
let approvalSeq = 0;

function send(window: BrowserWindow, channel: string, payload: unknown): void {
  if (!window.isDestroyed()) window.webContents.send(channel, payload);
}

export function setupAgentIPC(): void {
  ipcMain.handle(
    AGENT_CHANNELS.SEND,
    async (event, request: { turnId: string; prompt: string; options?: AgentCoreOptions }) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) return { success: false, error: "no window for this request" };

      const abort = new AbortController();
      const session: Session = { abort, pending: new Map() };
      sessions.set(request.turnId, session);

      try {
        const stream = run(request.prompt, {
          ...request.options,
          abortController: abort,
          approve: (approval: ApprovalRequest) =>
            new Promise<boolean>((resolve) => {
              const id = `approval-${++approvalSeq}`;
              session.pending.set(id, resolve);
              send(window, AGENT_CHANNELS.APPROVAL_REQUEST, {
                turnId: request.turnId,
                approvalId: id,
                ...approval,
              });
              // No timeout on purpose: a silent auto-deny would look like the agent
              // ignoring the user, and a silent auto-allow would be far worse. The turn
              // waits until a human answers or the turn is stopped.
              abort.signal.addEventListener("abort", () => {
                if (session.pending.delete(id)) resolve(false);
              });
            }),
        });

        for await (const message of stream) {
          send(window, AGENT_CHANNELS.MESSAGE, { turnId: request.turnId, message });
        }
        return { success: true };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        send(window, AGENT_CHANNELS.MESSAGE, {
          turnId: request.turnId,
          message: { type: "error", error: detail },
        });
        return { success: false, error: detail };
      } finally {
        sessions.delete(request.turnId);
      }
    },
  );

  ipcMain.handle(AGENT_CHANNELS.STOP, (_event, turnId: string) => {
    const session = sessions.get(turnId);
    if (!session) return { success: false, error: "no such turn" };
    session.abort.abort();
    return { success: true };
  });

  ipcMain.handle(
    AGENT_CHANNELS.APPROVAL_RESPONSE,
    (_event, response: { turnId: string; approvalId: string; granted: boolean }) => {
      const resolve = sessions.get(response.turnId)?.pending.get(response.approvalId);
      if (!resolve) return { success: false, error: "no such pending approval" };
      sessions.get(response.turnId)?.pending.delete(response.approvalId);
      resolve(response.granted);
      return { success: true };
    },
  );
}
