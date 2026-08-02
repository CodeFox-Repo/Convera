import type {
  LocalAIBranchConversationRequest,
  LocalAIChatRequest,
  LocalAIDeleteConversationRequest,
  LocalAIInteractionResponse,
  LocalAIMemorySettingsUpdate,
  LocalAIMessage,
  LocalAIProviderStatus,
  LocalAIResetProviderSessionRequest,
  LocalAIResult,
  LocalAIRuntimeService,
  LocalAISerializableError,
  LocalAIStartResult,
  LocalAIStreamEvent,
  LocalAITurnRuntimeStateRequest,
} from "@/shared/types/local-ai";
import { isLocalAIMemoryProvider } from "@/shared/types/local-ai";
import { createLocalAIAPI, LOCAL_AI_CHANNELS } from "./local-ai-api";
import {
  contextBridge,
  ipcMain,
  ipcRenderer,
  type IpcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";

export { createLocalAIAPI, LOCAL_AI_CHANNELS } from "./local-ai-api";

export interface LocalAIIPCOptions {
  runtime?: LocalAIRuntimeService;
  /** The renderer, plus any web bridge sender standing in for a browser tab. */
  getAllowedWebContents: () => WebContents | WebContents[] | null;
}

interface ActiveRequest {
  sender: WebContents;
}

interface SenderRequests {
  sender: WebContents;
  requestIds: Set<string>;
  leaseTokens: Set<string>;
  onDestroyed: () => void;
}

interface ActiveConversationLease {
  conversationId: string;
  leaseToken: string;
  sender: WebContents;
  deleting: boolean;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ALLOWED_PROVIDER_IDS = new Set([
  "claude-code",
  "codex-cli",
  "openai-api",
  "fireworks-api",
]);
const MAX_MESSAGE_CHARS = 200_000;
const MAX_REQUEST_CHARS = 1_000_000;
const MAX_INTERACTION_RESPONSE_CHARS = 20_000;
const MAX_METADATA_CHARS = 512;
const MAX_CWD_CHARS = 4_096;
const MAX_OUTPUT_TOKENS = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createError(message: string, code: string): LocalAISerializableError {
  return { name: "LocalAIIPCError", message, code };
}

function isOptionalString(value: unknown, maximumLength: number): boolean {
  return (
    value === undefined ||
    (typeof value === "string" && value.length <= maximumLength)
  );
}

function isValidIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    REQUEST_ID_PATTERN.test(value)
  );
}

function validateMessages(
  value: unknown,
  maximumCount = 1_000,
): value is LocalAIMessage[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > maximumCount
  ) {
    return false;
  }

  let totalChars = 0;
  return value.every((message) => {
    if (
      isRecord(message) &&
      isOptionalString(message.id, MAX_METADATA_CHARS) &&
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

function validateMessage(value: unknown): boolean {
  return validateMessages([value], 1);
}

function messagesMatch(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right)) return false;
  return (
    left.id === right.id &&
    left.role === right.role &&
    left.content === right.content
  );
}

export function serializeLocalAIError(
  error: unknown,
): LocalAISerializableError {
  if (error instanceof Error) {
    const serializableError = error as Error & {
      code?: unknown;
      retryable?: unknown;
    };
    const code = serializableError.code;
    return {
      name: error.name || "Error",
      message: error.message || String(error),
      ...(typeof code === "string" || typeof code === "number"
        ? { code: String(code) }
        : {}),
      ...(error.stack ? { stack: error.stack } : {}),
      ...(typeof serializableError.retryable === "boolean"
        ? { retryable: serializableError.retryable }
        : {}),
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
    const retryable =
      typeof error.retryable === "boolean" ? error.retryable : undefined;
    return {
      name,
      message,
      ...(code ? { code } : {}),
      ...(retryable === undefined ? {} : { retryable }),
    };
  }

  return { name: "Error", message: String(error) };
}

export function isAllowedLocalAISender(
  event: IpcMainInvokeEvent,
  allowedWebContents: WebContents | WebContents[] | null,
): boolean {
  if (!allowedWebContents || event.sender.isDestroyed()) return false;

  const allowed = Array.isArray(allowedWebContents)
    ? allowedWebContents
    : [allowedWebContents];

  if (
    !allowed.some(
      (candidate) => candidate === event.sender && !candidate.isDestroyed(),
    )
  ) {
    return false;
  }

  return event.senderFrame === event.sender.mainFrame;
}

function validateRequest(request: unknown): request is LocalAIChatRequest {
  if (
    !isRecord(request) ||
    !isValidIdentifier(request.requestId) ||
    !isValidIdentifier(request.conversationId) ||
    !isValidIdentifier(request.turnId) ||
    typeof request.providerId !== "string" ||
    !ALLOWED_PROVIDER_IDS.has(request.providerId) ||
    !isRecord(request.operation)
  ) {
    return false;
  }

  if (
    request.expectedRevision !== undefined &&
    (typeof request.expectedRevision !== "number" ||
      !Number.isInteger(request.expectedRevision) ||
      request.expectedRevision < 0)
  ) {
    return false;
  }

  if (!isOptionalString(request.modelId, MAX_METADATA_CHARS)) {
    return false;
  }

  if (request.agent !== undefined) {
    if (!isRecord(request.agent)) return false;
    if (
      request.agent.id !== undefined &&
      !isValidIdentifier(request.agent.id)
    ) {
      return false;
    }
    if (
      request.agent.memberId !== undefined &&
      !isValidIdentifier(request.agent.memberId)
    ) {
      return false;
    }
    if (
      request.agent.memberId !== undefined &&
      (request.agent.id === undefined ||
        request.agent.memberId !== `agent:${request.agent.id}`)
    ) {
      return false;
    }
    if (!isOptionalString(request.agent.systemPrompt, MAX_MESSAGE_CHARS)) {
      return false;
    }
  }

  if (request.agentHost !== undefined) {
    if (!isRecord(request.agentHost)) return false;
    if (
      !isValidIdentifier(request.agentHost.jobId) ||
      !isValidIdentifier(request.agentHost.taskId) ||
      (request.agentHost.channelKind !== "channel" &&
        request.agentHost.channelKind !== "dm") ||
      !isOptionalString(request.agentHost.roomContext, MAX_MESSAGE_CHARS)
    ) {
      return false;
    }
    const targets = request.agentHost.collaborationTargets;
    if (
      targets !== undefined &&
      (!Array.isArray(targets) ||
        targets.length > 16 ||
        !targets.every(
          (target) =>
            isRecord(target) &&
            isValidIdentifier(target.agentId) &&
            isValidIdentifier(target.memberId) &&
            target.memberId === `agent:${target.agentId}`,
        ))
    ) {
      return false;
    }
  }

  if (request.options !== undefined) {
    if (!isRecord(request.options)) return false;
    if (!isOptionalString(request.options.cwd, MAX_CWD_CHARS)) return false;
    if (
      request.options.temperature !== undefined &&
      (typeof request.options.temperature !== "number" ||
        !Number.isFinite(request.options.temperature))
    ) {
      return false;
    }
    if (
      request.options.maxOutputTokens !== undefined &&
      (typeof request.options.maxOutputTokens !== "number" ||
        !Number.isInteger(request.options.maxOutputTokens) ||
        request.options.maxOutputTokens <= 0 ||
        request.options.maxOutputTokens > MAX_OUTPUT_TOKENS)
    ) {
      return false;
    }
  }

  switch (request.operation.kind) {
    case "append": {
      if (!validateMessage(request.operation.message)) return false;
      if (request.operation.recoveryMessages === undefined) return true;
      if (!validateMessages(request.operation.recoveryMessages)) return false;
      return messagesMatch(
        request.operation.recoveryMessages.at(-1),
        request.operation.message,
      );
    }
    case "bootstrap":
      return validateMessages(request.operation.messages);
    case "rebase":
      return (
        (request.operation.reason === "edit" ||
          request.operation.reason === "regenerate" ||
          request.operation.reason === "provider-switch") &&
        isOptionalString(
          request.operation.sourceMessageId,
          MAX_METADATA_CHARS,
        ) &&
        validateMessages(request.operation.messages)
      );
    default:
      return false;
  }
}

function validateBranchRequest(
  request: unknown,
): request is LocalAIBranchConversationRequest {
  return (
    isRecord(request) &&
    isValidIdentifier(request.sourceConversationId) &&
    isValidIdentifier(request.targetConversationId) &&
    request.sourceConversationId !== request.targetConversationId &&
    isOptionalString(request.throughMessageId, MAX_METADATA_CHARS) &&
    validateMessages(request.bootstrapMessages)
  );
}

function validateDeleteRequest(
  request: unknown,
): request is LocalAIDeleteConversationRequest {
  return (
    isRecord(request) &&
    isValidIdentifier(request.conversationId) &&
    isValidIdentifier(request.leaseToken) &&
    typeof request.forgetConversationMemory === "boolean"
  );
}

function validateLeaseRequest(
  request: unknown,
): request is { conversationId: string; leaseToken: string } {
  return (
    isRecord(request) &&
    isValidIdentifier(request.conversationId) &&
    isValidIdentifier(request.leaseToken)
  );
}

function validateTurnRuntimeStateRequest(
  request: unknown,
): request is LocalAITurnRuntimeStateRequest {
  return (
    isRecord(request) &&
    isValidIdentifier(request.conversationId) &&
    isValidIdentifier(request.turnId)
  );
}

function validateResetRequest(
  request: unknown,
): request is LocalAIResetProviderSessionRequest {
  return (
    isRecord(request) &&
    isValidIdentifier(request.conversationId) &&
    typeof request.providerId === "string" &&
    ALLOWED_PROVIDER_IDS.has(request.providerId)
  );
}

function validateMemorySettingsUpdate(
  update: unknown,
): update is LocalAIMemorySettingsUpdate {
  if (!isRecord(update) || Object.keys(update).length === 0) return false;

  const allowedKeys = new Set([
    "provider",
    "subconsciousProvider",
    "schedule",
    "batchSize",
    "idleDelayMs",
  ]);
  if (Object.keys(update).some((key) => !allowedKeys.has(key))) return false;

  return (
    (update.provider === undefined ||
      (typeof update.provider === "string" &&
        isLocalAIMemoryProvider(update.provider))) &&
    (update.subconsciousProvider === undefined ||
      update.subconsciousProvider === "off" ||
      update.subconsciousProvider === "codex-cli" ||
      update.subconsciousProvider === "claude-code" ||
      update.subconsciousProvider === "follow-active") &&
    (update.schedule === undefined ||
      update.schedule === "every-turn" ||
      update.schedule === "batch" ||
      update.schedule === "idle") &&
    (update.batchSize === undefined ||
      (typeof update.batchSize === "number" &&
        Number.isInteger(update.batchSize) &&
        update.batchSize >= 2 &&
        update.batchSize <= 100)) &&
    (update.idleDelayMs === undefined ||
      (typeof update.idleDelayMs === "number" &&
        Number.isInteger(update.idleDelayMs) &&
        update.idleDelayMs >= 1_000 &&
        update.idleDelayMs <= 3_600_000))
  );
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
  const activeLeases = new Map<string, ActiveConversationLease>();

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
    if (
      tracked &&
      tracked.requestIds.size === 0 &&
      tracked.leaseTokens.size === 0
    ) {
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

  const getTrackedSender = (sender: WebContents) => {
    let tracked = senderRequests.get(sender.id);
    if (!tracked) {
      const onDestroyed = () => {
        const resources = senderRequests.get(sender.id);
        const requestIds = [...(resources?.requestIds ?? [])];
        const leaseTokens = [...(resources?.leaseTokens ?? [])];
        senderRequests.delete(sender.id);
        requestIds.forEach(abortAndRemove);
        leaseTokens.forEach((leaseToken) => {
          const lease = activeLeases.get(leaseToken);
          activeLeases.delete(leaseToken);
          if (!lease || lease.deleting || !options.runtime) return;
          void Promise.resolve(
            options.runtime.resumeConversation(
              lease.conversationId,
              lease.leaseToken,
            ),
          ).catch(() => {
            // The owning renderer no longer exists. Runtime-side lease
            // validation prevents releasing a newer owner's lease.
          });
        });
      };
      tracked = {
        sender,
        requestIds: new Set(),
        leaseTokens: new Set(),
        onDestroyed,
      };
      senderRequests.set(sender.id, tracked);
      sender.once("destroyed", onDestroyed);
    }
    return tracked;
  };

  const trackRequest = (requestId: string, sender: WebContents) => {
    activeRequests.set(requestId, { sender });
    const tracked = getTrackedSender(sender);
    tracked.requestIds.add(requestId);
  };

  const trackLease = (
    conversationId: string,
    leaseToken: string,
    sender: WebContents,
  ) => {
    activeLeases.set(leaseToken, {
      conversationId,
      leaseToken,
      sender,
      deleting: false,
    });
    getTrackedSender(sender).leaseTokens.add(leaseToken);
  };

  const removeTrackedLease = (leaseToken: string) => {
    const lease = activeLeases.get(leaseToken);
    if (!lease) return;
    activeLeases.delete(leaseToken);
    const tracked = senderRequests.get(lease.sender.id);
    tracked?.leaseTokens.delete(leaseToken);
    if (
      tracked &&
      tracked.requestIds.size === 0 &&
      tracked.leaseTokens.size === 0
    ) {
      tracked.sender.removeListener("destroyed", tracked.onDestroyed);
      senderRequests.delete(lease.sender.id);
    }
  };

  const ownedLease = (
    sender: WebContents,
    conversationId: string,
    leaseToken: string,
  ) => {
    const lease = activeLeases.get(leaseToken);
    return lease?.sender === sender && lease.conversationId === conversationId
      ? lease
      : undefined;
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

      let chat: Promise<void> | void;
      try {
        // Invoke synchronously so the runtime registers its AbortController
        // before the accepted response lets the renderer disappear.
        chat = runtime.startChat(request, emit);
      } catch (error) {
        chat = Promise.reject(error);
      }
      void Promise.resolve(chat)
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

      // A turn started by the Agent Host runs in the main process, so it was
      // never registered here the way a renderer-initiated chat is. Refusing
      // those answers left an agent that had called a tool waiting forever —
      // visible as a colleague stuck at "typing" that never says anything.
      // The runtime still checks the interaction is real and outstanding, so
      // an unknown request id is rejected there rather than silently accepted.
      const active = activeRequests.get(requestId);
      if (active && active.sender !== event.sender) {
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
        return {
          success: true,
          data: { aborted },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.GET_CONVERSATION_RUNTIME_STATE,
    async (event, conversationId: unknown) => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (!isValidIdentifier(conversationId)) {
        return failure(
          createError("Invalid conversation id", "LOCAL_AI_INVALID_REQUEST"),
        );
      }
      try {
        return {
          success: true,
          data: await options.runtime.getConversationRuntimeState(
            conversationId,
          ),
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.QUIESCE_CONVERSATION,
    async (event, conversationId: unknown) => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (!isValidIdentifier(conversationId)) {
        return failure(
          createError("Invalid conversation id", "LOCAL_AI_INVALID_REQUEST"),
        );
      }
      try {
        const leaseToken =
          await options.runtime.quiesceConversation(conversationId);
        if (event.sender.isDestroyed()) {
          await options.runtime.resumeConversation(conversationId, leaseToken);
          return failure(
            createError(
              "IPC sender was destroyed while acquiring the conversation lease",
              "LOCAL_AI_FORBIDDEN",
            ),
          );
        }
        trackLease(conversationId, leaseToken, event.sender);
        return {
          success: true,
          data: { quiesced: true as const, leaseToken },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.GET_TURN_RUNTIME_STATE,
    async (event, request: unknown) => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (!validateTurnRuntimeStateRequest(request)) {
        return failure(
          createError(
            "Invalid turn runtime state request",
            "LOCAL_AI_INVALID_REQUEST",
          ),
        );
      }
      try {
        return {
          success: true,
          data: await options.runtime.getTurnRuntimeState(request),
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.ACKNOWLEDGE_TURN_PERSISTENCE,
    async (event, request: unknown) => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (!validateTurnRuntimeStateRequest(request)) {
        return failure(
          createError(
            "Invalid turn persistence acknowledgement",
            "LOCAL_AI_INVALID_REQUEST",
          ),
        );
      }
      try {
        return {
          success: true,
          data: {
            acknowledged:
              await options.runtime.acknowledgeTurnPersistence(request),
          },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.RESUME_CONVERSATION,
    async (event, request: unknown) => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (!validateLeaseRequest(request)) {
        return failure(
          createError(
            "Invalid conversation lease request",
            "LOCAL_AI_INVALID_REQUEST",
          ),
        );
      }
      const lease = ownedLease(
        event.sender,
        request.conversationId,
        request.leaseToken,
      );
      if (!lease || lease.deleting) {
        return failure(
          createError(
            "Conversation lease is not owned by this sender",
            "LOCAL_AI_CONVERSATION_LEASE_INVALID",
          ),
        );
      }
      try {
        const resumed = await options.runtime.resumeConversation(
          request.conversationId,
          request.leaseToken,
        );
        removeTrackedLease(request.leaseToken);
        return {
          success: true,
          data: { resumed },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.BRANCH_CONVERSATION,
    async (event, request: unknown) => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (!validateBranchRequest(request)) {
        return failure(
          createError(
            "Invalid branch conversation request",
            "LOCAL_AI_INVALID_REQUEST",
          ),
        );
      }
      try {
        return {
          success: true,
          data: await options.runtime.branchConversation(request),
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.DELETE_CONVERSATION,
    async (event, request: unknown) => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (!validateDeleteRequest(request)) {
        return failure(
          createError(
            "Invalid delete conversation request",
            "LOCAL_AI_INVALID_REQUEST",
          ),
        );
      }
      const lease = ownedLease(
        event.sender,
        request.conversationId,
        request.leaseToken,
      );
      if (!lease || lease.deleting) {
        return failure(
          createError(
            "Conversation lease is not owned by this sender",
            "LOCAL_AI_CONVERSATION_LEASE_INVALID",
          ),
        );
      }
      lease.deleting = true;
      try {
        return {
          success: true,
          data: { deleted: await options.runtime.deleteConversation(request) },
        };
      } catch (error) {
        return failure(error);
      } finally {
        removeTrackedLease(request.leaseToken);
      }
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.RESET_CONVERSATION_PROVIDER_SESSION,
    async (event, request: unknown) => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (!validateResetRequest(request)) {
        return failure(
          createError(
            "Invalid reset provider session request",
            "LOCAL_AI_INVALID_REQUEST",
          ),
        );
      }
      try {
        return {
          success: true,
          data: await options.runtime.resetConversationProviderSession(request),
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  mainIPC.handle(LOCAL_AI_CHANNELS.GET_MEMORY_SETTINGS, async (event) => {
    if (!ensureSender(event)) {
      return failure(
        createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
      );
    }
    if (!options.runtime) return failure(runtimeUnavailable());
    try {
      return {
        success: true,
        data: await options.runtime.getMemorySettings(),
      };
    } catch (error) {
      return failure(error);
    }
  });

  mainIPC.handle(
    LOCAL_AI_CHANNELS.UPDATE_MEMORY_SETTINGS,
    async (event, update: unknown) => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (!validateMemorySettingsUpdate(update)) {
        return failure(
          createError(
            "Invalid memory settings update",
            "LOCAL_AI_INVALID_REQUEST",
          ),
        );
      }
      try {
        return {
          success: true,
          data: await options.runtime.updateMemorySettings(update),
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  mainIPC.handle(
    LOCAL_AI_CHANNELS.GET_MEMORY_STATUS,
    async (event, conversationId?: unknown) => {
      if (!ensureSender(event)) {
        return failure(
          createError("IPC sender is not allowed", "LOCAL_AI_FORBIDDEN"),
        );
      }
      if (!options.runtime) return failure(runtimeUnavailable());
      if (conversationId !== undefined && !isValidIdentifier(conversationId)) {
        return failure(
          createError("Invalid conversation id", "LOCAL_AI_INVALID_REQUEST"),
        );
      }
      try {
        return {
          success: true,
          data: await options.runtime.getMemoryStatus(conversationId),
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
    for (const lease of activeLeases.values()) {
      if (!lease.deleting && options.runtime) {
        void Promise.resolve(
          options.runtime.resumeConversation(
            lease.conversationId,
            lease.leaseToken,
          ),
        ).catch(() => {
          // IPC teardown has no remaining renderer to receive this failure.
        });
      }
    }
    activeLeases.clear();
    senderRequests.forEach(({ sender, onDestroyed }) => {
      sender.removeListener("destroyed", onDestroyed);
    });
    senderRequests.clear();
  };
}

export function exposeLocalAIContext() {
  contextBridge.exposeInMainWorld("localAI", createLocalAIAPI(ipcRenderer));
}
