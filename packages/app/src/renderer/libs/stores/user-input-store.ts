/**
 * User Input Store
 *
 * Manages pending user input requests from the ask_user_input tool.
 * Uses deferred Promise pattern to block AI generation until user responds.
 */

import { create } from "zustand";

interface PendingInput {
  toolCallId: string;
  question: string;
  options: string[];
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  createdAt: number;
}

interface UserInputState {
  pendingInputs: Map<string, PendingInput>;

  /**
   * Register a new pending input request.
   * Returns a Promise that resolves when user responds.
   */
  registerPendingInput: (
    toolCallId: string,
    question: string,
    options: string[],
  ) => Promise<string>;

  /**
   * Resolve a pending input with user's selection.
   * Called when user clicks an option or submits custom input.
   */
  resolvePendingInput: (toolCallId: string, value: string) => void;

  /**
   * Reject/cancel a pending input.
   * Called on timeout or chat reset.
   */
  rejectPendingInput: (toolCallId: string, error?: string) => void;

  /**
   * Check if a tool call is pending user input.
   */
  isPending: (toolCallId: string) => boolean;

  /**
   * Get pending input details by toolCallId.
   */
  getPendingInput: (toolCallId: string) => PendingInput | undefined;

  /**
   * Clear all pending inputs.
   * Called on chat reset.
   */
  clearAllPending: () => void;
}

export const useUserInputStore = create<UserInputState>((set, get) => ({
  pendingInputs: new Map(),

  registerPendingInput: (toolCallId, question, options) => {
    return new Promise<string>((resolve, reject) => {
      set((state) => {
        const newMap = new Map(state.pendingInputs);
        newMap.set(toolCallId, {
          toolCallId,
          question,
          options,
          resolve,
          reject,
          createdAt: Date.now(),
        });
        return { pendingInputs: newMap };
      });
    });
  },

  resolvePendingInput: (toolCallId, value) => {
    const pending = get().pendingInputs.get(toolCallId);
    if (pending) {
      pending.resolve(value);
      set((state) => {
        const newMap = new Map(state.pendingInputs);
        newMap.delete(toolCallId);
        return { pendingInputs: newMap };
      });
    }
  },

  rejectPendingInput: (toolCallId, error = "User cancelled") => {
    const pending = get().pendingInputs.get(toolCallId);
    if (pending) {
      pending.reject(new Error(error));
      set((state) => {
        const newMap = new Map(state.pendingInputs);
        newMap.delete(toolCallId);
        return { pendingInputs: newMap };
      });
    }
  },

  isPending: (toolCallId) => get().pendingInputs.has(toolCallId),

  getPendingInput: (toolCallId) => get().pendingInputs.get(toolCallId),

  clearAllPending: () => {
    const pending = get().pendingInputs;
    pending.forEach((p) => p.reject(new Error("Chat reset")));
    set({ pendingInputs: new Map() });
  },
}));

/**
 * Hook to check if there are any pending inputs.
 */
export const useHasPendingInput = () => {
  const pendingInputs = useUserInputStore((state) => state.pendingInputs);
  return pendingInputs.size > 0;
};
