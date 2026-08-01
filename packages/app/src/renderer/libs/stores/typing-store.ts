import { create } from "zustand";
import { WORKSPACE_SEND_MESSAGE_TOOL } from "@/shared/types/workspace-perception";

/**
 * Who is composing a message, right now.
 *
 * One state, two transitions: the speech tool opens and the member is typing;
 * it closes and they are not. Nothing is inferred and nothing is smoothed —
 * the indicator is up for exactly as long as the tool call it reports, which
 * is the whole time the model spends writing the message.
 *
 * Keyed by `toolCallId`, the stream's own identity for one call: it survives a
 * turn being re-asked, distinguishes two calls by the same agent, and is
 * carried by the very chunks that retire it.
 */

/**
 * Safety net, not a timing rule. A turn that dies between opening the tool and
 * closing it never sends the chunk that would clear the indicator, and whoever
 * started it may be gone too. Far longer than any real call so it never cuts
 * one short — it only guarantees a stuck one eventually disappears.
 */
export const TYPING_MAX_MS = 5 * 60 * 1000;

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

const expiries = new Map<string, ReturnType<typeof setTimeout>>();

function clearExpiry(toolCallId: string): void {
  const timer = expiries.get(toolCallId);
  if (timer) {
    clearTimeout(timer);
    expiries.delete(toolCallId);
  }
}

export const useTypingStore = create<TypingState>((set, get) => ({
  typing: {},

  startTyping: (toolCallId, memberId, conversationId) => {
    clearExpiry(toolCallId);
    expiries.set(
      toolCallId,
      setTimeout(() => get().stopTyping(toolCallId), TYPING_MAX_MS),
    );
    set((state) => ({
      typing: {
        ...state.typing,
        [toolCallId]: { memberId, conversationId },
      },
    }));
  },

  stopTyping: (toolCallId) => {
    clearExpiry(toolCallId);
    set((state) => {
      if (!(toolCallId in state.typing)) return state;
      const next = { ...state.typing };
      delete next[toolCallId];
      return { typing: next };
    });
  },

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
    // `tool-input-start`, not `tool-input-available`: the latter only fires
    // once the whole call has been written, which for a real reply is the
    // moment before it posts — the indicator would flash rather than cover
    // the compose. Tool names arrive qualified ("workspace:send_message").
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
