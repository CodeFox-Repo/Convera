import type {
  LocalAIInteractionResponse,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import { create } from "zustand";

type InteractionEvent = Extract<LocalAIStreamEvent, { type: "interaction" }>;

interface PendingInput {
  requestId: string;
  interactionId: string;
  kind: InteractionEvent["kind"];
  name: string;
  question: string;
  options: string[];
  input?: unknown;
  respond(response: LocalAIInteractionResponse): Promise<void>;
  createdAt: number;
}

interface UserInputState {
  pendingInputs: Map<string, PendingInput>;
  registerInteraction(
    event: InteractionEvent,
    respond: PendingInput["respond"],
  ): void;
  resolvePendingInput(interactionId: string, value: string): Promise<void>;
  dismissRequest(requestId: string): void;
  clearAllPending(): void;
}

export const useUserInputStore = create<UserInputState>((set, get) => ({
  pendingInputs: new Map(),

  registerInteraction: (event, respond) => {
    set((state) => {
      const pendingInputs = new Map(state.pendingInputs);
      pendingInputs.set(event.interactionId, {
        requestId: event.requestId,
        interactionId: event.interactionId,
        kind: event.kind,
        name: event.name,
        question: event.prompt,
        options: event.options ?? [],
        input: event.input,
        respond,
        createdAt: Date.now(),
      });
      return { pendingInputs };
    });
  },

  resolvePendingInput: async (interactionId, value) => {
    const pending = get().pendingInputs.get(interactionId);
    if (!pending) return;

    await pending.respond(
      pending.kind === "approval"
        ? { approved: value === "Allow once" }
        : { value },
    );
    set((state) => {
      const pendingInputs = new Map(state.pendingInputs);
      pendingInputs.delete(interactionId);
      return { pendingInputs };
    });
  },

  dismissRequest: (requestId) => {
    set((state) => ({
      pendingInputs: new Map(
        [...state.pendingInputs].filter(
          ([, pending]) => pending.requestId !== requestId,
        ),
      ),
    }));
  },

  clearAllPending: () => {
    const pending = [...get().pendingInputs.values()];
    set({ pendingInputs: new Map() });
    pending.forEach((interaction) => {
      void interaction.respond(
        interaction.kind === "approval" ? { approved: false } : {},
      );
    });
  },
}));

export const useHasPendingInput = () => {
  const pendingInputs = useUserInputStore((state) => state.pendingInputs);
  return pendingInputs.size > 0;
};
