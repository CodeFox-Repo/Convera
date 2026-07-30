import type { UIMessage as AISDKUIMessage } from "ai";

export interface Attachment {
  url: string;
  name?: string;
  contentType?: string;
}

export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  state: "partial-call" | "call" | "result";
  result?: unknown;
}

export type LegacyMessagePart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "tool-invocation";
      toolInvocation: ToolInvocation;
    };

export type MessagePart = AISDKUIMessage["parts"][number] | LegacyMessagePart;

/**
 * Renderer and Dexie use the stable, content-based message shape that Convera
 * persisted before AI SDK 6. Provider-specific ModelMessage conversion happens
 * only in Electron Main.
 */
export interface UIMessage {
  id: string;
  role: "system" | "user" | "assistant" | "data";
  content: string;
  createdAt?: Date;
  parts?: MessagePart[];
  toolInvocations?: ToolInvocation[];
  experimental_attachments?: Attachment[];
}

export type Message = UIMessage;
