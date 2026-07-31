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
  /** Member.id of the speaker; absent on history written before member identity. */
  senderId?: string;
  /** Member ids explicitly mentioned by this message. */
  mentions?: string[];
  /** emoji -> Member.id[] who reacted. Only set on persisted messages. */
  reactions?: Record<string, string[]>;
  createdAt?: Date;
  parts?: MessagePart[];
  experimental_attachments?: Attachment[];
}

export type Message = UIMessage;
