import type {
  MessagePart,
  ToolInvocation,
  UIMessage,
} from "@/renderer/types/chat";

/**
 * Re-export AI SDK types for consistency
 */
export type { MessagePart, ToolInvocation, UIMessage };

/**
 * Type guards for different part types
 */
export function isTextPart(
  part: MessagePart,
): part is Extract<MessagePart, { type: "text" }> {
  return part.type === "text";
}

export function isToolInvocationPart(
  part: MessagePart,
): part is Extract<MessagePart, { type: "tool-invocation" }> {
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
