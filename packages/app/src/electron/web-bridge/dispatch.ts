import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import { EventEmitter } from "node:events";

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

export interface RecordingIpcMain
  extends Pick<IpcMain, "handle" | "removeHandler"> {
  /** Call a handler registered through this proxy, bypassing Electron IPC. */
  dispatch: (
    channel: string,
    args: unknown[],
    event: IpcMainInvokeEvent,
  ) => Promise<unknown>;
}

/**
 * Wraps `ipcMain` so every registered handler stays reachable by channel name.
 * Electron exposes no way to call its own handlers, and the web bridge needs
 * exactly that — the alternative is duplicating every handler for HTTP.
 */
export function createRecordingIpcMain(target: IpcMain): RecordingIpcMain {
  const handlers = new Map<string, InvokeHandler>();

  return {
    handle: (channel: string, handler: InvokeHandler) => {
      handlers.set(channel, handler);
      target.handle(channel, handler);
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel);
      target.removeHandler(channel);
    },
    dispatch: async (channel, args, event) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No IPC handler registered for "${channel}"`);
      }
      return handler(event, ...args);
    },
  };
}

/**
 * A WebContents stand-in for browser clients. `local-ai-context` identifies
 * senders by object reference and pushes stream events through `send`, so the
 * browser gets the same lifecycle (per-request tracking, abort on disconnect)
 * as a real renderer without any special-casing there.
 */
export class WebBridgeSender extends EventEmitter {
  private static nextId = -1;

  readonly id = WebBridgeSender.nextId--;
  readonly mainFrame = {};

  private destroyed = false;

  constructor(
    private emit_: (channel: string, payload: unknown) => void,
  ) {
    super();
  }

  /**
   * Point this sender at a freshly reconnected socket.
   *
   * A browser tab keeps its identity across a dropped WebSocket (HMR, sleep, a
   * flaky network), but an in-flight turn was tracked against *this* sender
   * object. Destroying it on reconnect made every later event — including the
   * `finish` that clears the loading state — get dropped as "sender gone", so
   * the reply streamed into nothing and the bubble stayed on "..." until a
   * reload read the already-persisted turn from disk.
   */
  rebind(emit: (channel: string, payload: unknown) => void) {
    if (this.destroyed) return;
    this.emit_ = emit;
  }

  isDestroyed() {
    return this.destroyed;
  }

  send(channel: string, payload: unknown) {
    if (this.destroyed) return;
    this.emit_(channel, payload);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit("destroyed");
  }
}

export function createWebBridgeEvent(
  sender: WebBridgeSender,
): IpcMainInvokeEvent {
  return {
    sender: sender as unknown as WebContents,
    senderFrame: sender.mainFrame,
  } as unknown as IpcMainInvokeEvent;
}
