import { create } from "zustand";

/**
 * Who is about to say something.
 *
 * Speaking is a tool call now, so there is no reply slot to show while an agent
 * thinks — and pre-creating one is exactly what we removed: an empty bubble is
 * a claim that someone spoke. A typing indicator makes the wait visible without
 * making that claim, and it is driven by the stream's own tool lifecycle
 * (`tool-input-start` for the speech tool) rather than a timer or a guess.
 *
 * The indicator is deliberately keyed by request: an agent that opens the tool
 * and then errors must not leave the room permanently "typing", so whoever
 * starts a turn is also responsible for clearing it.
 */
interface TypingState {
  /** requestId -> the member id that is composing a message. */
  typing: Record<string, string>;
  startTyping: (requestId: string, memberId: string) => void;
  stopTyping: (requestId: string) => void;
  typingMemberIds: () => string[];
}

export const useTypingStore = create<TypingState>((set, get) => ({
  typing: {},

  startTyping: (requestId, memberId) =>
    set((state) => ({ typing: { ...state.typing, [requestId]: memberId } })),

  stopTyping: (requestId) =>
    set((state) => {
      if (!(requestId in state.typing)) return state;
      const next = { ...state.typing };
      delete next[requestId];
      return { typing: next };
    }),

  typingMemberIds: () => [...new Set(Object.values(get().typing))],
}));
