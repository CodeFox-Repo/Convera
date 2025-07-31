import type { UIMessage as AISDKUIMessage, ToolInvocation as AISDKToolInvocation } from "ai";

/**
 * Re-export AI SDK types for consistency
 */
export type UIMessage = AISDKUIMessage;
export type ToolInvocation = AISDKToolInvocation;

/**
 * Extract the parts type from UIMessage
 * The AI SDK UIMessage can have parts array with different content types
 */
export type MessagePart = NonNullable<UIMessage["parts"]>[number];

/**
 * Type guards for different part types
 */
export function isTextPart(part: MessagePart): part is Extract<MessagePart, { type: "text" }> {
  return part.type === "text";
}

export function isToolInvocationPart(part: MessagePart): part is Extract<MessagePart, { type: "tool-invocation" }> {
  return part.type === "tool-invocation";
}

/**
 * Component props using AI SDK types
 */
export interface MessagePartRendererProps {
  part: MessagePart;
  index: number;
}

export interface ToolCallRendererProps {
  toolInvocation: ToolInvocation;
  index: number;
}

export interface MessageContentRendererProps {
  message: UIMessage;
}