import type { Message } from "@/renderer/types/chat";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LocalAIChatRequest,
  LocalAIFinishReason,
  LocalAIInteractionResponse,
  LocalAIMessage,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import { handleWorkspaceQueryInteraction } from "../workspace-perception";
import {
  createLocalAIUIMessageStream,
  type LocalAIUIMessageStream,
} from "../local-ai-ui-stream";
import { getLocalAI, type LocalAIProviderId } from "../local-ai";
import { useUserInputStore } from "../stores/user-input-store";
import {
  buildLocalAIChatOperation,
  type RendererChatOperation,
} from "../local-ai-request";
import {
  failPendingTurn,
  rollbackPendingTurn,
  stagePendingTurn,
  updatePendingTurnJournalState,
  type MessageSnapshot,
} from "../db/hooks";
import {
  completeConversationTurnPersistence,
  registerConversationTurnPersistence,
} from "../conversation-turn-persistence";
import { persistBeforeStartChat } from "../durable-chat-start";
import { reconcilePendingTurns } from "../conversation-turn-reconciliation";

export interface LocalAIChatOptions {
  providerId: LocalAIProviderId;
  conversationId: string;
  turnId: string;
  expectedRevision?: number;
  model?: string;
  agent?: LocalAIChatRequest["agent"];
  options?: LocalAIChatRequest["options"];
  operation: RendererChatOperation;
  requestMessages?: LocalAIMessage[];
  responderId?: string;
}

export interface LocalAICompletedTurn {
  conversationId: string;
  turnId: string;
  providerId: LocalAIProviderId;
  modelId?: string;
  expectedRevision?: number;
  userMessageId?: string;
  assistantMessageId: string;
  revision: number;
  finishReason: LocalAIFinishReason;
}

interface UseLocalAIChatResult {
  messages: Message[];
  input: string;
  isLoading: boolean;
  status: "ready" | "submitted" | "streaming" | "error";
  error: Error | undefined;
  lastCompletedTurn: LocalAICompletedTurn | undefined;
  setInput: (input: string) => void;
  setMessages: (messages: Message[]) => void;
  send: (
    message: Omit<Message, "id">,
    options: LocalAIChatOptions,
    baseMessages: Message[],
  ) => Promise<boolean>;
  resend: (
    messages: Message[],
    options: LocalAIChatOptions,
    durableBaseMessages: Message[],
  ) => Promise<boolean>;
  stop: () => Promise<void>;
}

function createMessageId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function toMessageSnapshots(messages: Message[]): MessageSnapshot[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as "user" | "assistant" | "system" | "tool",
    content:
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content),
    parts: message.parts,
    experimental_attachments: message.experimental_attachments?.map(
      (attachment) => ({
        url: attachment.url,
        name: attachment.name ?? "",
        contentType: attachment.contentType ?? "",
      }),
    ),
    senderId: message.senderId,
    mentions: message.mentions,
    reactions: message.reactions,
  }));
}

/**
 * The cause differs by host: in a browser the bridge is simply not wired up
 * (fixable from the URL), under Electron the runtime genuinely failed to load.
 */
function unavailableRuntimeError(): Error {
  return new Error(
    window.electronAPI
      ? "Local AI runtime is not available. Restart Convera, and check that the Claude Code or Codex CLI is installed."
      : "Not connected to Convera. Open the link printed by `CONVERA_WEB_BRIDGE=1 pnpm start` — this page needs the token it contains.",
  );
}

export function useLocalAIChat(): UseLocalAIChatResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<UseLocalAIChatResult["status"]>("ready");
  const [error, setError] = useState<Error>();
  const [lastCompletedTurn, setLastCompletedTurn] =
    useState<LocalAICompletedTurn>();
  const messagesRef = useRef<Message[]>(messages);
  const activeRequestIdRef = useRef<string | undefined>(undefined);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  const activeUIMessageStreamRef = useRef<LocalAIUIMessageStream | undefined>(
    undefined,
  );
  const activeTurnRef = useRef<
    Omit<LocalAICompletedTurn, "revision" | "finishReason"> | undefined
  >(undefined);
  messagesRef.current = messages;

  const releaseSubscription = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = undefined;
  }, []);

  const closeUIMessageStream = useCallback(async () => {
    const stream = activeUIMessageStreamRef.current;
    if (!stream) return;
    stream.close();
    await stream.done;
    if (activeUIMessageStreamRef.current === stream) {
      activeUIMessageStreamRef.current = undefined;
    }
  }, []);

  const handleEvent = useCallback(
    (event: LocalAIStreamEvent) => {
      if (event.requestId !== activeRequestIdRef.current) return;

      if (event.type === "ui-message") {
        setStatus("streaming");
        activeUIMessageStreamRef.current?.push(event.chunk);
        return;
      }

      if (event.type === "error") {
        setError(new Error(event.error.message));
        return;
      }

      if (event.type === "interaction") {
        const localAI = getLocalAI();
        if (!localAI) {
          setError(unavailableRuntimeError());
          setStatus("error");
          return;
        }

        setStatus("streaming");
        const respond = async (response: LocalAIInteractionResponse) => {
          const result = await localAI.respondToInteraction(
            event.requestId,
            event.interactionId,
            response,
          );
          if (!result.success || !result.data?.accepted) {
            throw new Error(
              result.error?.message ||
                "Local AI interaction is no longer active.",
            );
          }
        };
        if (handleWorkspaceQueryInteraction(event, respond)) return;
        useUserInputStore.getState().registerInteraction(event, respond);
        return;
      }

      const stream = activeUIMessageStreamRef.current;
      stream?.close();
      void (stream?.done ?? Promise.resolve()).finally(() => {
        if (activeRequestIdRef.current !== event.requestId) return;
        const activeTurn = activeTurnRef.current;
        if (activeTurn) {
          setLastCompletedTurn({
            ...activeTurn,
            revision: event.revision ?? activeTurn.expectedRevision ?? 0,
            finishReason: event.finishReason,
          });
        }
        if (activeUIMessageStreamRef.current === stream) {
          activeUIMessageStreamRef.current = undefined;
        }
        setStatus(event.finishReason === "error" ? "error" : "ready");
        useUserInputStore.getState().dismissRequest(event.requestId);
        activeRequestIdRef.current = undefined;
        activeTurnRef.current = undefined;
        releaseSubscription();
      });
    },
    [releaseSubscription],
  );

  const run = useCallback(
    async (
      nextMessages: Message[],
      options: LocalAIChatOptions,
      durableBaseMessages: Message[],
    ) => {
      const localAI = getLocalAI();
      if (!localAI) {
        setError(unavailableRuntimeError());
        setStatus("error");
        return false;
      }

      if (activeRequestIdRef.current) {
        const previousRequestId = activeRequestIdRef.current;
        const previousTurn = activeTurnRef.current;
        const abortResult = await localAI.abort(previousRequestId);
        if (!abortResult.success) {
          throw new Error(
            abortResult.error?.message ||
              "Could not stop the previous local AI request.",
          );
        }
        useUserInputStore.getState().dismissRequest(previousRequestId);
        releaseSubscription();
        activeRequestIdRef.current = undefined;
        await closeUIMessageStream();
        if (previousTurn) {
          await failPendingTurn(
            previousTurn.conversationId,
            previousTurn.turnId,
            "aborted",
          ).catch(() => undefined);
          completeConversationTurnPersistence(previousTurn.turnId);
        }
      }

      const previousMessages = messagesRef.current;
      const requestId = crypto.randomUUID();
      const assistantMessageId = createMessageId("assistant");
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        ...(options.responderId ? { senderId: options.responderId } : {}),
        createdAt: new Date(),
      };
      const uiMessageStream = createLocalAIUIMessageStream({
        messageId: assistantMessageId,
        createdAt: assistantMessage.createdAt!,
        onMessage: (message) => {
          const stamped = options.responderId
            ? { ...message, senderId: options.responderId }
            : message;
          setMessages((current) =>
            current.map((candidate) =>
              candidate.id === assistantMessageId ? stamped : candidate,
            ),
          );
        },
        onError: (streamError) => {
          setError(streamError);
        },
      });
      const userMessageId =
        options.operation.kind === "rebase" &&
        options.operation.reason === "regenerate"
          ? undefined
          : nextMessages.at(-1)?.id;
      const activeTurn = {
        conversationId: options.conversationId,
        turnId: options.turnId,
        providerId: options.providerId,
        modelId: options.model,
        expectedRevision: options.expectedRevision,
        userMessageId,
        assistantMessageId,
      };

      setError(undefined);
      setLastCompletedTurn(undefined);
      setStatus("submitted");
      setMessages([...nextMessages, assistantMessage]);
      activeRequestIdRef.current = requestId;
      activeTurnRef.current = activeTurn;
      activeUIMessageStreamRef.current = uiMessageStream;
      unsubscribeRef.current = localAI.onEvent(requestId, (event) => {
        handleEvent(event);
      });

      let staged = false;
      let crossedIPC = false;
      let explicitlyRejected = false;
      try {
        const operation = buildLocalAIChatOperation(
          nextMessages,
          options.operation,
          options.requestMessages,
        );
        registerConversationTurnPersistence(
          options.conversationId,
          options.turnId,
        );
        const result = await persistBeforeStartChat(
          async () => {
            const priorTurns = await reconcilePendingTurns({
              conversationId: options.conversationId,
              preferLiveGrace: true,
            });
            const unresolved = priorTurns.find(
              (turn) => !turn.locallySettled || turn.ackPending,
            );
            if (unresolved) {
              throw (
                unresolved.error ??
                new Error(
                  "The previous conversation turn is still being reconciled.",
                )
              );
            }
            await stagePendingTurn(
              options.conversationId,
              toMessageSnapshots(durableBaseMessages),
              toMessageSnapshots([...nextMessages, assistantMessage]),
              {
                turnId: options.turnId,
                requestId,
                revision: options.expectedRevision ?? 0,
                providerId: options.providerId,
                modelId: options.model,
                operation: options.operation.kind,
                operationReason:
                  options.operation.kind === "rebase"
                    ? options.operation.reason
                    : undefined,
                sourceMessageId:
                  options.operation.kind === "rebase"
                    ? options.operation.sourceMessageId
                    : undefined,
                userMessageId,
                assistantMessageId,
              },
            );
            staged = true;
          },
          () => {
            crossedIPC = true;
            return localAI.startChat({
              requestId,
              conversationId: options.conversationId,
              turnId: options.turnId,
              expectedRevision: options.expectedRevision,
              providerId: options.providerId,
              modelId: options.model,
              operation,
              agent: options.agent,
              options: options.options,
            });
          },
        );

        if (!result.success || !result.accepted) {
          explicitlyRejected = true;
          throw new Error(
            result.error?.message || "Local AI runtime rejected the chat.",
          );
        }
        await updatePendingTurnJournalState(
          options.conversationId,
          options.turnId,
          "accepted",
        ).catch(() => undefined);
        return true;
      } catch (startError) {
        const nextError =
          startError instanceof Error
            ? startError
            : new Error("Failed to start local AI chat.");
        setError(nextError);
        setStatus("error");
        useUserInputStore.getState().dismissRequest(requestId);
        activeRequestIdRef.current = undefined;
        activeTurnRef.current = undefined;
        releaseSubscription();
        await closeUIMessageStream();
        if (staged && explicitlyRejected) {
          await rollbackPendingTurn(
            options.conversationId,
            options.turnId,
          ).catch(() => undefined);
        } else if (staged && crossedIPC) {
          await updatePendingTurnJournalState(
            options.conversationId,
            options.turnId,
            "transport-uncertain",
          ).catch(() => undefined);
        }
        completeConversationTurnPersistence(options.turnId);
        setMessages(previousMessages);
        return false;
      }
    },
    [closeUIMessageStream, handleEvent, releaseSubscription],
  );

  const send = useCallback(
    async (
      message: Omit<Message, "id">,
      options: LocalAIChatOptions,
      baseMessages: Message[],
    ) => {
      const userMessage: Message = {
        ...message,
        id: createMessageId("user"),
        createdAt: new Date(),
      };
      return await run([...baseMessages, userMessage], options, baseMessages);
    },
    [run],
  );

  const resend = useCallback(
    async (
      nextMessages: Message[],
      options: LocalAIChatOptions,
      durableBaseMessages: Message[],
    ) => {
      return await run(nextMessages, options, durableBaseMessages);
    },
    [run],
  );

  const stop = useCallback(async () => {
    const requestId = activeRequestIdRef.current;
    const localAI = getLocalAI();
    if (!requestId || !localAI) return;

    try {
      const result = await localAI.abort(requestId);
      if (!result.success) {
        throw new Error(
          result.error?.message || "Could not stop the local AI request.",
        );
      }

      // A successful abort emits the terminal event through onEvent. If the
      // main process no longer owns the request, there will be no event to
      // wait for, so release the local listener here.
      if (!result.data?.aborted) {
        const activeTurn = activeTurnRef.current;
        useUserInputStore.getState().dismissRequest(requestId);
        activeRequestIdRef.current = undefined;
        activeTurnRef.current = undefined;
        releaseSubscription();
        await closeUIMessageStream();
        if (activeTurn) {
          await failPendingTurn(
            activeTurn.conversationId,
            activeTurn.turnId,
            "aborted",
          ).catch(() => undefined);
          completeConversationTurnPersistence(activeTurn.turnId);
        }
        setStatus("ready");
      }
    } catch (abortError) {
      setError(
        abortError instanceof Error
          ? abortError
          : new Error("Could not stop the local AI request."),
      );
      setStatus("error");
    }
  }, [closeUIMessageStream, releaseSubscription]);

  useEffect(
    () => () => {
      const requestId = activeRequestIdRef.current;
      const activeTurn = activeTurnRef.current;
      const localAI = getLocalAI();
      releaseSubscription();
      activeUIMessageStreamRef.current?.close();
      activeUIMessageStreamRef.current = undefined;
      activeTurnRef.current = undefined;
      if (requestId && localAI) {
        useUserInputStore.getState().dismissRequest(requestId);
        void localAI.abort(requestId);
      }
      if (activeTurn) {
        void failPendingTurn(
          activeTurn.conversationId,
          activeTurn.turnId,
          "aborted",
        )
          .catch(() => undefined)
          .finally(() => {
            completeConversationTurnPersistence(activeTurn.turnId);
          });
      }
    },
    [releaseSubscription],
  );

  return {
    messages,
    input,
    isLoading: status === "submitted" || status === "streaming",
    status,
    error,
    lastCompletedTurn,
    setInput,
    setMessages,
    send,
    resend,
    stop,
  };
}
