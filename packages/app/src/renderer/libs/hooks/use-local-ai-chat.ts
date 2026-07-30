import type { Message } from "@/renderer/types/chat";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LocalAIChatRequest,
  LocalAIFinishReason,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
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

export interface LocalAIChatOptions {
  providerId: LocalAIProviderId;
  conversationId: string;
  turnId: string;
  expectedRevision?: number;
  model?: string;
  agent?: LocalAIChatRequest["agent"];
  options?: LocalAIChatRequest["options"];
  operation: RendererChatOperation;
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
  ) => Promise<boolean>;
  resend: (
    messages: Message[],
    options: LocalAIChatOptions,
  ) => Promise<boolean>;
  stop: () => Promise<void>;
}

function createMessageId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
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
          setError(new Error("Local AI runtime is not available."));
          setStatus("error");
          return;
        }

        setStatus("streaming");
        useUserInputStore
          .getState()
          .registerInteraction(event, async (response) => {
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
          });
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
    async (nextMessages: Message[], options: LocalAIChatOptions) => {
      const localAI = getLocalAI();
      if (!localAI) {
        setError(new Error("Local AI runtime is not available."));
        setStatus("error");
        return false;
      }

      if (activeRequestIdRef.current) {
        const previousRequestId = activeRequestIdRef.current;
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
      }

      const previousMessages = messagesRef.current;
      const requestId = crypto.randomUUID();
      const assistantMessageId = createMessageId("assistant");
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: new Date(),
      };
      const uiMessageStream = createLocalAIUIMessageStream({
        messageId: assistantMessageId,
        createdAt: assistantMessage.createdAt!,
        onMessage: (message) => {
          setMessages((current) =>
            current.map((candidate) =>
              candidate.id === assistantMessageId ? message : candidate,
            ),
          );
        },
        onError: (streamError) => {
          setError(streamError);
        },
      });

      setError(undefined);
      setLastCompletedTurn(undefined);
      setStatus("submitted");
      setMessages([...nextMessages, assistantMessage]);
      activeRequestIdRef.current = requestId;
      activeTurnRef.current = {
        conversationId: options.conversationId,
        turnId: options.turnId,
        providerId: options.providerId,
        modelId: options.model,
        expectedRevision: options.expectedRevision,
        userMessageId:
          options.operation.kind === "rebase" &&
          options.operation.reason === "regenerate"
            ? undefined
            : nextMessages.at(-1)?.id,
        assistantMessageId,
      };
      activeUIMessageStreamRef.current = uiMessageStream;
      unsubscribeRef.current = localAI.onEvent(requestId, (event) => {
        handleEvent(event);
      });

      try {
        const operation = buildLocalAIChatOperation(
          nextMessages,
          options.operation,
        );

        const result = await localAI.startChat({
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

        if (!result.success || !result.accepted) {
          throw new Error(
            result.error?.message || "Local AI runtime rejected the chat.",
          );
        }
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
        setMessages(previousMessages);
        return false;
      }
    },
    [closeUIMessageStream, handleEvent, releaseSubscription],
  );

  const send = useCallback(
    async (message: Omit<Message, "id">, options: LocalAIChatOptions) => {
      const userMessage: Message = {
        ...message,
        id: createMessageId("user"),
        createdAt: new Date(),
      };
      return await run([...messages, userMessage], options);
    },
    [messages, run],
  );

  const resend = useCallback(
    async (nextMessages: Message[], options: LocalAIChatOptions) => {
      return await run(nextMessages, options);
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
        useUserInputStore.getState().dismissRequest(requestId);
        activeRequestIdRef.current = undefined;
        activeTurnRef.current = undefined;
        releaseSubscription();
        await closeUIMessageStream();
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
      const localAI = getLocalAI();
      releaseSubscription();
      activeUIMessageStreamRef.current?.close();
      activeUIMessageStreamRef.current = undefined;
      activeTurnRef.current = undefined;
      if (requestId && localAI) {
        useUserInputStore.getState().dismissRequest(requestId);
        void localAI.abort(requestId);
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
