import type { Message } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LocalAIChatRequest,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import { getLocalAI, type LocalAIProviderId } from "../local-ai";

export interface LocalAIChatOptions {
  providerId: LocalAIProviderId;
  model?: string;
  agent?: LocalAIChatRequest["agent"];
  options?: LocalAIChatRequest["options"];
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

function applyToolEvent(
  message: Message,
  event: Extract<LocalAIStreamEvent, { type: "tool" }>,
): Message {
  const existing = message.toolInvocations || [];
  const withoutCurrent = existing.filter(
    (tool) => tool.toolCallId !== event.toolCallId,
  );
  const base = {
    toolCallId: event.toolCallId,
    toolName: event.name,
    args: event.input ?? {},
  };

  const next =
    event.state === "output-available"
      ? { ...base, state: "result" as const, result: event.output }
      : event.state === "output-error"
        ? {
            ...base,
            state: "result" as const,
            result: { error: event.error?.message },
          }
        : { ...base, state: "call" as const };

  return {
    ...message,
    toolInvocations: [...withoutCurrent, next],
  };
}

export function useLocalAIChat(): UseLocalAIChatResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<UseLocalAIChatResult["status"]>("ready");
  const [error, setError] = useState<Error>();
  const activeRequestIdRef = useRef<string | undefined>(undefined);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);

  const releaseSubscription = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = undefined;
  }, []);

  const handleEvent = useCallback(
    (assistantMessageId: string, event: LocalAIStreamEvent) => {
      if (event.requestId !== activeRequestIdRef.current) return;

      if (event.type === "delta") {
        setStatus("streaming");
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: `${message.content}${event.text}`,
                }
              : message,
          ),
        );
        return;
      }

      if (event.type === "tool") {
        setStatus("streaming");
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? applyToolEvent(message, event)
              : message,
          ),
        );
        return;
      }

      if (event.type === "error") {
        setError(new Error(event.error.message));
        setStatus("error");
        return;
      }

      setStatus(event.finishReason === "error" ? "error" : "ready");
      activeRequestIdRef.current = undefined;
      releaseSubscription();
    },
    [releaseSubscription],
  );

  const run = useCallback(
    async (nextMessages: Message[], options: LocalAIChatOptions) => {
      const localAI = getLocalAI();
      if (!localAI) {
        setError(new Error("Local AI runtime is not available."));
        setStatus("error");
        return;
      }

      if (activeRequestIdRef.current) {
        const abortResult = await localAI.abort(activeRequestIdRef.current);
        if (!abortResult.success) {
          throw new Error(
            abortResult.error?.message ||
              "Could not stop the previous local AI request.",
          );
        }
        releaseSubscription();
        activeRequestIdRef.current = undefined;
      }

      const requestId = crypto.randomUUID();
      const assistantMessageId = createMessageId("assistant");
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: new Date(),
      };

      setError(undefined);
      setStatus("submitted");
      setMessages([...nextMessages, assistantMessage]);
      activeRequestIdRef.current = requestId;
      unsubscribeRef.current = localAI.onEvent(requestId, (event) => {
        handleEvent(assistantMessageId, event);
      });

      try {
        const result = await localAI.startChat({
          requestId,
          providerId: options.providerId,
          modelId: options.model,
          messages: toRequestMessages(nextMessages),
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
        activeRequestIdRef.current = undefined;
        releaseSubscription();
      }
    },
    [handleEvent, releaseSubscription],
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
        activeRequestIdRef.current = undefined;
        releaseSubscription();
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
  }, [releaseSubscription]);

  useEffect(
    () => () => {
      const requestId = activeRequestIdRef.current;
      const localAI = getLocalAI();
      releaseSubscription();
      if (requestId && localAI) {
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
