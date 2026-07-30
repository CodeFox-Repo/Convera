import type {
  ILocalAIAPI,
  LocalAIChatRequest,
  LocalAIInteractionResponse,
  LocalAIProviderStatus,
  LocalAIResult,
  LocalAIRuntimeService,
  LocalAISerializableError,
  LocalAIStartResult,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import {
  contextBridge,
  ipcMain,
  ipcRenderer,
  type IpcMain,
  type IpcMainInvokeEvent,
  type IpcRenderer,
  type WebContents,
} from "electron";

export const LOCAL_AI_CHANNELS = {
  LIST_PROVIDERS: "local-ai:list-providers",
  GET_PROVIDER_STATUS: "local-ai:get-provider-status",
  START_CHAT: "local-ai:start-chat",
  ABORT: "local-ai:abort",
  RESPOND_INTERACTION: "local-ai:respond-interaction",
  EVENT: "local-ai:event",
} as const;

export interface LocalAIIPCOptions {
  runtime?: LocalAIRuntimeService;
  getAllowedWebContents: () => WebContents | null;
}

interface ActiveRequest {
  sender: WebContents;
}

interface SenderRequests {
  sender: WebContents;
  requestIds: Set<string>;
  onDestroyed: () => void;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ALLOWED_PROVIDER_IDS = new Set(["claude-code", "codex-cli"]);
const MAX_MESSAGE_CHARS = 200_000;
const MAX_REQUEST_CHARS = 1_000_000;
const MAX_INTERACTION_RESPONSE_CHARS = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createError(message: string, code: string): LocalAISerializableError {
  return { name: "LocalAIIPCError", message, code };
}

export function serializeLocalAIError(
  error: unknown,
): LocalAISerializableError {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return {
      name: error.name || "Error",
      message: error.message || String(error),
      ...(typeof code === "string" || typeof code === "number"
        ? { code: String(code) }
        : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  if (isRecord(error)) {
    const name = typeof error.name === "string" ? error.name : "Error";
    const message =
      typeof error.message === "string" ? error.message : String(error);
    const code =
      typeof error.code === "string" || typeof error.code === "number"
        ? String(error.code)
        : undefined;
    return { name, message, ...(code ? { code } : {}) };
  }

  return { name: "Error", message: String(error) };
}

export function isAllowedLocalAISender(
  event: IpcMainInvokeEvent,
  allowedWebContents: WebContents | null,
): boolean {
  if (
    !allowedWebContents ||
    allowedWebContents.isDestroyed() ||
    event.sender.isDestroyed() ||
    event.sender !== allowedWebContents
  ) {
    return false;
  }

  return event.senderFrame === event.sender.mainFrame;
}

function validateRequest(request: unknown): request is LocalAIChatRequest {
  if (
    !isRecord(request) ||
    typeof request.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(request.requestId) ||
    typeof request.providerId !== "string" ||
    !ALLOWED_PROVIDER_IDS.has(request.providerId) ||
    !Array.isArray(request.messages) ||
    request.messages.length === 0 ||
    request.messages.length > 1_000
  ) {
    return false;
  }

  let totalChars = 0;
  return request.messages.every((message) => {
    if (
      isRecord(message) &&
      (message.role === "system" ||
        message.role === "user" ||
        message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.length <= MAX_MESSAGE_CHARS
    ) {
      totalChars += message.content.length;
      return totalChars <= MAX_REQUEST_CHARS;
    }
    return false;
  });
}

function validateInteractionResponse(
  response: unknown,
): response is LocalAIInteractionResponse {
  if (!isRecord(response)) return false;

  const keys = Object.keys(response);
  if (
    keys.length === 0 ||
    keys.some((key) => key !== "approved" && key !== "value")
  ) {
    return false;
  }

  return (
    (response.approved === undefined ||
      typeof response.approved === "boolean") &&
    (response.value === undefined ||
      (typeof response.value === "string" &&
        response.value.length <= MAX_INTERACTION_RESPONSE_CHARS))
  );
}

function failure<T>(error: unknown): LocalAIResult<T> {
  return { success: false, error: serializeLocalAIError(error) };
}

/**
 * Register the privileged side of the local AI bridge.
 *
 * The runtime is injected so this bridge has no dependency on a particular
 * Claude, Codex, or OpenAI-compatible implementation.
 */
export function setupLocalAIIPC(
  options: LocalAIIPCOptions,
  mainIPC: Pick<IpcMain, "handle" | "removeHandler"> = ipcMain,
): () => void {
  const activeRequests = new Map<string, ActiveRequest>();
  const senderRequests = new Map<number, SenderRequests>();

  const runtimeUnavailable = () =>
    createError(
      "Local AI runtime is not available",
      "LOCAL_AI_RUNTIME_UNAVAILABLE",
    );

  const removeActiveRequest = (requestId: string) => {
    const active = activeRequests.get(requestId);
    if (!active) return;

    activeRequests.delete(requestId);
    const tracked = senderRequests.get(active.sender.id);
    tracked?.requestIds.delete(requestId);
    if (tracked && tracked.requestIds.size === 0) {
      tracked.sender.removeListener("destroyed", tracked.onDestroyed);
      senderRequests.delete(active.sender.id);
    }
  };

  const abortAndRemove = (requestId: string) => {
    removeActiveRequest(requestId);
    if (options.runtime) {
      void Promise.resolve(options.runtime.abort(requestId)).catch(() => {
        // The sender has gone away; there is nowhere safe to report this.
      });
    }
  };

  const trackRequest = (requestId: string, sender: WebContents) => {
    activeRequests.set(requestId, { sender });

    let tracked = senderRequests.get(sender.id);
    if (!tracked) {
      const onDestroyed = () => {
        const requestIds = [
          ...(senderRequests.get(sender.id)?.requestIds ?? []),
        ];
        senderRequests.delete(sender.id);
        requestIds.forEach(abortAndRemove);
      };
      tracked = { sender, requestIds: new Set(), onDestroyed };
      senderRequests.set(sender.id, tracked);
      sender.once("destroyed", onDestroyed);
    }
    tracked.requestIds.add(requestId);
  };

  const ensureSender = (event: IpcMainInvokeEvent) =>
    isAllowedLocalAISender(event, options.getAllowedWebContents());

  mainIPC.handle(
    LOCAL_AI_CHANNELS.LIST_PROVIDERS,
    async (event): Promise<LocalAIResult<LocalAIProviderStatus[]>> => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());

      try {
        return {
          success: true,
          data: await options.runtime.listProviders(),
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.GET_PROVIDER_STATUS,
    async (
      event,
      providerId: unknown,
    ): Promise<LocalAIResult<LocalAIProviderStatus>> => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (
        typeof providerId !== "string" ||
        !ALLOWED_PROVIDER_IDS.has(providerId)
      ) {
        return failure(
          createError("Invalid provider id", "LOCAL_AI_INVALID_REQUEST"),
        );
      }

      try {
        return {
          success: true,
          data: await options.runtime.getProviderStatus(providerId),
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.START_CHAT,
    (event, request: unknown): LocalAIStartResult => {
      if (!ensureSender(event)) {
        return {
          success: false,
          accepted: false,
          error: createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        };
      }
      const runtime = options.runtime;
      if (!runtime) {
        return {
          success: false,
          accepted: false,
          error: runtimeUnavailable(),
        };
      }
      if (!validateRequest(request)) {
        return {
          success: false,
          accepted: false,
          error: createError(
            "Invalid local AI chat request",
            "LOCAL_AI_INVALID_REQUEST",
          ),
        };
      }
      if (activeRequests.has(request.requestId)) {
        return {
          success: false,
          accepted: false,
          error: createError(
            `Request "${request.requestId}" is already active`,
            "LOCAL_AI_DUPLICATE_REQUEST",
          ),
        };
      }

      const sender = event.sender;
      trackRequest(request.requestId, sender);

      const emit = (runtimeEvent: LocalAIStreamEvent) => {
        const active = activeRequests.get(request.requestId);
        if (!active || active.sender !== sender || sender.isDestroyed()) {
          return;
        }

        const streamEvent: LocalAIStreamEvent =
          runtimeEvent.type === "error"
            ? {
                ...runtimeEvent,
                requestId: request.requestId,
                error: serializeLocalAIError(runtimeEvent.error),
              }
            : runtimeEvent.type === "tool" && runtimeEvent.error
              ? {
                  ...runtimeEvent,
                  requestId: request.requestId,
                  error: serializeLocalAIError(runtimeEvent.error),
                }
              : { ...runtimeEvent, requestId: request.requestId };

        try {
          sender.send(LOCAL_AI_CHANNELS.EVENT, streamEvent);
        } catch {
          abortAndRemove(request.requestId);
          return;
        }

        if (streamEvent.type === "finish") {
          removeActiveRequest(request.requestId);
        }
      };

      void Promise.resolve()
        .then(() => runtime.startChat(request, emit))
        .then(() => {
          if (activeRequests.has(request.requestId)) {
            emit({
              type: "finish",
              requestId: request.requestId,
              finishReason: "unknown",
            });
          }
        })
        .catch((error) => {
          if (!activeRequests.has(request.requestId)) return;
          emit({
            type: "error",
            requestId: request.requestId,
            error: serializeLocalAIError(error),
          });
          emit({
            type: "finish",
            requestId: request.requestId,
            finishReason: "error",
          });
        });

      return { success: true, accepted: true };
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.RESPOND_INTERACTION,
    async (
      event,
      requestId: unknown,
      interactionId: unknown,
      response: unknown,
    ): Promise<LocalAIResult<{ accepted: boolean }>> => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (
        typeof requestId !== "string" ||
        !REQUEST_ID_PATTERN.test(requestId) ||
        typeof interactionId !== "string" ||
        !REQUEST_ID_PATTERN.test(interactionId) ||
        !validateInteractionResponse(response)
      ) {
        return failure(
          createError(
            "Invalid local AI interaction response",
            "LOCAL_AI_INVALID_REQUEST",
          ),
        );
      }

      const active = activeRequests.get(requestId);
      if (!active || active.sender !== event.sender) {
        return { success: true, data: { accepted: false } };
      }

      try {
        return {
          success: true,
          data: {
            accepted: await options.runtime.respondToInteraction(
              requestId,
              interactionId,
              response,
            ),
          },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.ABORT,
    async (
      event,
      requestId: unknown,
    ): Promise<LocalAIResult<{ aborted: boolean }>> => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (
        typeof requestId !== "string" ||
        !REQUEST_ID_PATTERN.test(requestId)
      ) {
        return failure(
          createError("Invalid request id", "LOCAL_AI_INVALID_REQUEST"),
        );
      }

      const active = activeRequests.get(requestId);
      if (!active || active.sender !== event.sender) {
        return {
          success: true,
          data: { aborted: false },
        };
      }

      try {
        const aborted = await options.runtime.abort(requestId);
        const stillActive = activeRequests.get(requestId);
        if (aborted && stillActive?.sender === event.sender) {
          try {
            if (!event.sender.isDestroyed()) {
              event.sender.send(LOCAL_AI_CHANNELS.EVENT, {
                type: "finish",
                requestId,
                finishReason: "aborted",
              } satisfies LocalAIStreamEvent);
            }
          } finally {
            removeActiveRequest(requestId);
          }
        }
        return {
          success: true,
          data: { aborted },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  return () => {
    Object.values(LOCAL_AI_CHANNELS)
      .filter((channel) => channel !== LOCAL_AI_CHANNELS.EVENT)
      .forEach((channel) => mainIPC.removeHandler(channel));

    [...activeRequests.keys()].forEach(abortAndRemove);
    senderRequests.forEach(({ sender, onDestroyed }) => {
      sender.removeListener("destroyed", onDestroyed);
    });
    senderRequests.clear();
  };
}

export function createLocalAIAPI(
  rendererIPC: Pick<IpcRenderer, "invoke" | "on" | "removeListener">,
): ILocalAIAPI {
  return {
    listProviders: () => rendererIPC.invoke(LOCAL_AI_CHANNELS.LIST_PROVIDERS),
    getProviderStatus: (providerId) =>
      rendererIPC.invoke(LOCAL_AI_CHANNELS.GET_PROVIDER_STATUS, providerId),
    startChat: (request) =>
      rendererIPC.invoke(LOCAL_AI_CHANNELS.START_CHAT, request),
    abort: (requestId) =>
      rendererIPC.invoke(LOCAL_AI_CHANNELS.ABORT, requestId),
    respondToInteraction: (requestId, interactionId, response) =>
      rendererIPC.invoke(
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

export function exposeLocalAIContext() {
  contextBridge.exposeInMainWorld("localAI", createLocalAIAPI(ipcRenderer));
}
