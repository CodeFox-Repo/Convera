import type { ILocalAIAPI, LocalAIStreamEvent } from "@/shared/types/local-ai";

export const LOCAL_AI_CHANNELS = {
  LIST_PROVIDERS: "local-ai:list-providers",
  GET_PROVIDER_STATUS: "local-ai:get-provider-status",
  START_CHAT: "local-ai:start-chat",
  ABORT: "local-ai:abort",
  RESPOND_INTERACTION: "local-ai:respond-interaction",
  GET_CONVERSATION_RUNTIME_STATE: "local-ai:get-conversation-runtime-state",
  GET_TURN_RUNTIME_STATE: "local-ai:get-turn-runtime-state",
  ACKNOWLEDGE_TURN_PERSISTENCE: "local-ai:acknowledge-turn-persistence",
  QUIESCE_CONVERSATION: "local-ai:quiesce-conversation",
  RESUME_CONVERSATION: "local-ai:resume-conversation",
  BRANCH_CONVERSATION: "local-ai:branch-conversation",
  DELETE_CONVERSATION: "local-ai:delete-conversation",
  RESET_CONVERSATION_PROVIDER_SESSION:
    "local-ai:reset-conversation-provider-session",
  GET_MEMORY_SETTINGS: "local-ai:get-memory-settings",
  UPDATE_MEMORY_SETTINGS: "local-ai:update-memory-settings",
  GET_MEMORY_STATUS: "local-ai:get-memory-status",
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
    getConversationRuntimeState: (conversationId) =>
      invoke(LOCAL_AI_CHANNELS.GET_CONVERSATION_RUNTIME_STATE, conversationId),
    getTurnRuntimeState: (request) =>
      invoke(LOCAL_AI_CHANNELS.GET_TURN_RUNTIME_STATE, request),
    acknowledgeTurnPersistence: (request) =>
      invoke(LOCAL_AI_CHANNELS.ACKNOWLEDGE_TURN_PERSISTENCE, request),
    quiesceConversation: (conversationId) =>
      invoke(LOCAL_AI_CHANNELS.QUIESCE_CONVERSATION, conversationId),
    resumeConversation: (request) =>
      invoke(LOCAL_AI_CHANNELS.RESUME_CONVERSATION, request),
    branchConversation: (request) =>
      invoke(LOCAL_AI_CHANNELS.BRANCH_CONVERSATION, request),
    deleteConversation: (request) =>
      invoke(LOCAL_AI_CHANNELS.DELETE_CONVERSATION, request),
    resetConversationProviderSession: (request) =>
      invoke(LOCAL_AI_CHANNELS.RESET_CONVERSATION_PROVIDER_SESSION, request),
    getMemorySettings: () => invoke(LOCAL_AI_CHANNELS.GET_MEMORY_SETTINGS),
    updateMemorySettings: (update) =>
      invoke(LOCAL_AI_CHANNELS.UPDATE_MEMORY_SETTINGS, update),
    getMemoryStatus: (conversationId) =>
      invoke(LOCAL_AI_CHANNELS.GET_MEMORY_STATUS, conversationId),
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
