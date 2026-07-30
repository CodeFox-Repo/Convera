import type { Message } from "@/renderer/types/chat";
import {
  readUIMessageStream,
  type UIMessage as AISDKUIMessage,
  type UIMessageChunk,
} from "ai";
import { createTextDrip, type TextDrip } from "./text-drip";

export interface LocalAIUIMessageStream {
  push(chunk: UIMessageChunk): void;
  close(): void;
  done: Promise<void>;
}

/** Disable smoothing (tests, or a provider that already streams per-token). */
export interface LocalAIUIMessageStreamOptions {
  smoothText?: boolean;
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
  smoothText?: boolean;
}): LocalAIUIMessageStream {
  let controller: ReadableStreamDefaultController<UIMessageChunk> | undefined;
  let closed = false;
  const stream = new ReadableStream<UIMessageChunk>({
    start(streamController) {
      controller = streamController;
    },
  });

  // One drip per text part id: the CLI providers deliver ~100-char bursts, and
  // re-emitting them as small deltas is what makes the text read as typing.
  const drips = new Map<string, TextDrip>();
  const dripFor = (id: string) => {
    let drip = drips.get(id);
    if (!drip) {
      drip = createTextDrip({
        onText: (delta) => {
          if (!closed) controller?.enqueue({ type: "text-delta", id, delta });
        },
      });
      drips.set(id, drip);
    }
    return drip;
  };
  const flushDrips = () => {
    drips.forEach((drip) => drip.flush());
    drips.clear();
  };

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

  const smooth = options.smoothText ?? true;

  return {
    push(chunk) {
      if (closed) return;
      if (smooth && chunk.type === "text-delta") {
        dripFor(chunk.id).push(chunk.delta);
        return;
      }
      // A text part ending must not overtake the text still dripping into it.
      if (smooth && chunk.type === "text-end") {
        drips.get(chunk.id)?.flush();
        drips.delete(chunk.id);
      }
      controller?.enqueue(chunk);
    },
    close() {
      if (closed) return;
      // Emit whatever is still buffered before ending the stream, so an abort
      // or a fast finish never truncates the visible text.
      flushDrips();
      closed = true;
      controller?.close();
    },
    done,
  };
}
