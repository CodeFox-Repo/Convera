import type { ILocalAIAPI, LocalAIStreamEvent } from "@/shared/types/local-ai";

export const LOCAL_AI_CHANNELS = {
  LIST_PROVIDERS: "local-ai:list-providers",
  GET_PROVIDER_STATUS: "local-ai:get-provider-status",
  START_CHAT: "local-ai:start-chat",
  ABORT: "local-ai:abort",
  RESPOND_INTERACTION: "local-ai:respond-interaction",
  EVENT: "local-ai:event",
} as const;

/**
 * Electron-free so both the preload (real `ipcRenderer`) and the browser
 * (HTTP shim) can build the same API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IPCListener = (...args: any[]) => void;

export interface LocalAIRendererIPC {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, listener: IPCListener) => void;
  removeListener: (channel: string, listener: IPCListener) => void;
}

export function createLocalAIAPI(rendererIPC: LocalAIRendererIPC): ILocalAIAPI {
  const invoke = rendererIPC.invoke.bind(rendererIPC) as <T>(
    channel: string,
    ...args: unknown[]
  ) => Promise<T>;

  return {
    listProviders: () => invoke(LOCAL_AI_CHANNELS.LIST_PROVIDERS),
    getProviderStatus: (providerId) =>
      invoke(LOCAL_AI_CHANNELS.GET_PROVIDER_STATUS, providerId),
    startChat: (request) => invoke(LOCAL_AI_CHANNELS.START_CHAT, request),
    abort: (requestId) => invoke(LOCAL_AI_CHANNELS.ABORT, requestId),
    respondToInteraction: (requestId, interactionId, response) =>
      invoke(
        LOCAL_AI_CHANNELS.RESPOND_INTERACTION,
        requestId,
        interactionId,
        response,
      ),
    onEvent: (requestId, callback) => {
      const handler = (_event: unknown, event: LocalAIStreamEvent) => {
        if (event.requestId === requestId) callback(event);
      };
      rendererIPC.on(LOCAL_AI_CHANNELS.EVENT, handler);
      return () => {
        rendererIPC.removeListener(LOCAL_AI_CHANNELS.EVENT, handler);
      };
    },
  };
}
