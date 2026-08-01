import { create } from "zustand";
import { WORKSPACE_SEND_MESSAGE_TOOL } from "@/shared/types/workspace-perception";

/**
 * Who is about to say something.
 *
 * Speaking is a tool call now, so there is no reply slot to show while an agent
 * thinks — and pre-creating one is exactly what we removed: an empty bubble is
 * a claim that someone spoke. A typing indicator makes the wait visible without
 * making that claim.
 *
 * It is driven by the stream and nothing else. An agent that is merely working
 * — reading channels, thinking, deciding to stay quiet — is not typing, and
 * showing it as typing is a claim that a message is coming when none is. Only
 * the speech tool actually opening counts, which the stream reports as
 * `tool-input-start` for `send_message`.
 *
 * Keyed by `toolCallId`, the stream's own identity for one call: it survives a
 * turn being re-asked, distinguishes two calls by the same agent, and is
 * carried by the very chunks that retire it.
 */
interface TypingState {
  /** toolCallId -> who is composing and which conversation may display it. */
  typing: Record<string, { memberId: string; conversationId: string }>;
  startTyping: (
    toolCallId: string,
    memberId: string,
    conversationId: string,
  ) => void;
  stopTyping: (toolCallId: string) => void;
  typingMemberIds: (conversationId: string) => string[];
}

export const useTypingStore = create<TypingState>((set, get) => ({
  typing: {},

  startTyping: (toolCallId, memberId, conversationId) =>
    set((state) => ({
      typing: {
        ...state.typing,
        [toolCallId]: { memberId, conversationId },
      },
    })),

  stopTyping: (toolCallId) =>
    set((state) => {
      if (!(toolCallId in state.typing)) return state;
      const next = { ...state.typing };
      delete next[toolCallId];
      return { typing: next };
    }),

  typingMemberIds: (conversationId) => [
    ...new Set(
      Object.values(get().typing)
        .filter((entry) => entry.conversationId === conversationId)
        .map((entry) => entry.memberId),
    ),
  ],
}));

/**
 * What one UI-message chunk means for the indicator, or nothing at all.
 *
 * Both the channel path (`agent-host-service`) and the 1:1 path
 * (`use-local-ai-chat`) read the same stream, so they read it the same way
 * here rather than each keeping its own idea of when someone is typing.
 *
 * Every terminal shape of a tool call closes it — output, error, denial. A
 * chunk for some other tool closes a `toolCallId` the store never opened,
 * which `stopTyping` ignores.
 */
export function typingTransition(
  chunk: unknown,
): { open: boolean; toolCallId: string } | undefined {
  if (typeof chunk !== "object" || chunk === null) return undefined;
  const { type, toolCallId, toolName } = chunk as {
    type?: string;
    toolCallId?: string;
    toolName?: string;
  };
  if (typeof toolCallId !== "string" || !toolCallId) return undefined;
  if (type === "tool-input-start") {
    // Tool names reach the renderer qualified ("workspace:send_message").
    return toolName?.endsWith(WORKSPACE_SEND_MESSAGE_TOOL)
      ? { open: true, toolCallId }
      : undefined;
  }
  if (
    type === "tool-output-available" ||
    type === "tool-output-error" ||
    type === "tool-output-denied" ||
    type === "tool-input-error"
  ) {
    return { open: false, toolCallId };
  }
  return undefined;
}
