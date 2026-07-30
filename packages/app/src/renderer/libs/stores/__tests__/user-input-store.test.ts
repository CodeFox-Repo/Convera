import type { LocalAIStreamEvent } from "@/shared/types/local-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUserInputStore } from "../user-input-store";

function interaction(
  overrides: Partial<Extract<LocalAIStreamEvent, { type: "interaction" }>> = {},
): Extract<LocalAIStreamEvent, { type: "interaction" }> {
  return {
    type: "interaction",
    requestId: "request-1",
    interactionId: "interaction-1",
    kind: "approval",
    name: "builtin:execute_command",
    prompt: "Allow this command?",
    options: ["Allow once", "Deny"],
    ...overrides,
  };
}

describe("user input store", () => {
  beforeEach(() => {
    useUserInputStore.setState({ pendingInputs: new Map() });
  });

  it("maps approval choices to a structured runtime response", async () => {
    const respond = vi.fn(async () => undefined);
    useUserInputStore.getState().registerInteraction(interaction(), respond);

    await useUserInputStore
      .getState()
      .resolvePendingInput("interaction-1", "Allow once");

    expect(respond).toHaveBeenCalledWith({ approved: true });
    expect(useUserInputStore.getState().pendingInputs.size).toBe(0);
  });

  it("returns text input and keeps a failed response available to retry", async () => {
    const respond = vi
      .fn()
      .mockRejectedValueOnce(new Error("IPC failed"))
      .mockResolvedValueOnce(undefined);
    useUserInputStore.getState().registerInteraction(
      interaction({
        kind: "input",
        name: "builtin:ask_user_input",
        prompt: "Choose",
        options: ["Alpha"],
      }),
      respond,
    );

    await expect(
      useUserInputStore
        .getState()
        .resolvePendingInput("interaction-1", "Alpha"),
    ).rejects.toThrow("IPC failed");
    expect(useUserInputStore.getState().pendingInputs.size).toBe(1);

    await useUserInputStore
      .getState()
      .resolvePendingInput("interaction-1", "Alpha");
    expect(respond).toHaveBeenLastCalledWith({ value: "Alpha" });
    expect(useUserInputStore.getState().pendingInputs.size).toBe(0);
  });
});
