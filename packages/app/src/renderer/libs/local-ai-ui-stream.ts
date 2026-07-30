import type { Message } from "@/renderer/types/chat";
import {
  readUIMessageStream,
  type UIMessage as AISDKUIMessage,
  type UIMessageChunk,
} from "ai";

export interface LocalAIUIMessageStream {
  push(chunk: UIMessageChunk): void;
  close(): void;
  done: Promise<void>;
}

function toRendererMessage(message: AISDKUIMessage, createdAt: Date): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.parts
      .filter(
        (
          part,
        ): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
          part.type === "text",
      )
      .map((part) => part.text)
      .join(""),
    parts: message.parts,
    createdAt,
  };
}

export function createLocalAIUIMessageStream(options: {
  messageId: string;
  createdAt: Date;
  onMessage(message: Message): void;
  onError(error: Error): void;
}): LocalAIUIMessageStream {
  let controller: ReadableStreamDefaultController<UIMessageChunk> | undefined;
  let closed = false;
  const stream = new ReadableStream<UIMessageChunk>({
    start(streamController) {
      controller = streamController;
    },
  });

  const done = (async () => {
    try {
      for await (const message of readUIMessageStream({
        message: {
          id: options.messageId,
          role: "assistant",
          parts: [],
        },
        stream,
        onError: (error) => {
          options.onError(
            error instanceof Error ? error : new Error(String(error)),
          );
        },
      })) {
        options.onMessage(toRendererMessage(message, options.createdAt));
      }
    } catch (error) {
      options.onError(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  })();

  return {
    push(chunk) {
      if (!closed) controller?.enqueue(chunk);
    },
    close() {
      if (closed) return;
      closed = true;
      controller?.close();
    },
    done,
  };
}
