import type { UIMessage as AISDKUIMessage } from "ai";

export interface Attachment {
  url: string;
  name?: string;
  contentType?: string;
}

export type MessagePart = AISDKUIMessage["parts"][number];

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
  experimental_attachments?: Attachment[];
}

export type Message = UIMessage;
