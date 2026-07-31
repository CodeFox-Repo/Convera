import type { Message } from "@/renderer/types/chat";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LocalAIChatRequest,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import {
  createLocalAIUIMessageStream,
  type LocalAIUIMessageStream,
} from "../local-ai-ui-stream";
import { getLocalAI, type LocalAIProviderId } from "../local-ai";
import { useUserInputStore } from "../stores/user-input-store";

export interface LocalAIChatOptions {
  providerId: LocalAIProviderId;
  model?: string;
  agent?: LocalAIChatRequest["agent"];
  options?: LocalAIChatRequest["options"];
  /**
   * What the provider receives, when it differs from what the UI shows.
   * Multi-agent channels send each agent its own projection of the shared
   * transcript (see agent-projection.ts) while the UI keeps the full one.
   */
  requestMessages?: LocalAIChatRequest["messages"];
  /** Member id stamped on the streamed assistant message. */
  responderId?: string;
}

interface UseLocalAIChatResult {
  messages: Message[];
  input: string;
  isLoading: boolean;
  status: "ready" | "submitted" | "streaming" | "error";
  error: Error | undefined;
  setInput: (input: string) => void;
  setMessages: (messages: Message[]) => void;
  send: (
    message: Omit<Message, "id">,
    options: LocalAIChatOptions,
  ) => Promise<void>;
  resend: (messages: Message[], options: LocalAIChatOptions) => Promise<void>;
  stop: () => Promise<void>;
}

function createMessageId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
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

function toRequestMessages(messages: Message[]) {
  return messages
    .filter(
      (
        message,
      ): message is Message & {
        role: "system" | "user" | "assistant";
      } =>
        message.role === "system" ||
        message.role === "user" ||
        message.role === "assistant",
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      content:
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content),
    }));
}

export function useLocalAIChat(): UseLocalAIChatResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<UseLocalAIChatResult["status"]>("ready");
  const [error, setError] = useState<Error>();
  const activeRequestIdRef = useRef<string | undefined>(undefined);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  const activeUIMessageStreamRef = useRef<LocalAIUIMessageStream | undefined>(
    undefined,
  );

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
        setStatus("error");
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
        if (activeUIMessageStreamRef.current === stream) {
          activeUIMessageStreamRef.current = undefined;
        }
        setStatus(event.finishReason === "error" ? "error" : "ready");
        useUserInputStore.getState().dismissRequest(event.requestId);
        activeRequestIdRef.current = undefined;
        releaseSubscription();
      });
    },
    [releaseSubscription],
  );

  const run = useCallback(
    async (nextMessages: Message[], options: LocalAIChatOptions) => {
      const localAI = getLocalAI();
      if (!localAI) {
        setError(unavailableRuntimeError());
        setStatus("error");
        return;
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
          setStatus("error");
        },
      });

      setError(undefined);
      setStatus("submitted");
      setMessages([...nextMessages, assistantMessage]);
      activeRequestIdRef.current = requestId;
      activeUIMessageStreamRef.current = uiMessageStream;
      unsubscribeRef.current = localAI.onEvent(requestId, (event) => {
        handleEvent(event);
      });

      try {
        const result = await localAI.startChat({
          requestId,
          providerId: options.providerId,
          modelId: options.model,
          messages: options.requestMessages ?? toRequestMessages(nextMessages),
          agent: options.agent,
          options: options.options,
        });

        if (!result.success || !result.accepted) {
          throw new Error(
            result.error?.message || "Local AI runtime rejected the chat.",
          );
        }
      } catch (startError) {
        const nextError =
          startError instanceof Error
            ? startError
            : new Error("Failed to start local AI chat.");
        setError(nextError);
        setStatus("error");
        useUserInputStore.getState().dismissRequest(requestId);
        activeRequestIdRef.current = undefined;
        releaseSubscription();
        await closeUIMessageStream();
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
      await run([...messages, userMessage], options);
    },
    [messages, run],
  );

  const resend = useCallback(
    async (nextMessages: Message[], options: LocalAIChatOptions) => {
      await run(nextMessages, options);
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
    setInput,
    setMessages,
    send,
    resend,
    stop,
  };
}
