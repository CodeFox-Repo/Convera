import { beforeEach, describe, expect, it } from "vitest";
import { typingTransition, useTypingStore } from "./typing-store";

describe("typingTransition", () => {
  it("opens only on the speech tool, and only from the stream", () => {
    expect(
      typingTransition({
        type: "tool-input-start",
        toolCallId: "call-1",
        toolName: "workspace:send_message",
      }),
    ).toEqual({ open: true, toolCallId: "call-1" });
    // Reading the room is working, not composing.
    expect(
      typingTransition({
        type: "tool-input-start",
        toolCallId: "call-2",
        toolName: "workspace:read_channel",
      }),
    ).toBeUndefined();
    // Thinking out loud is not composing either.
    expect(
      typingTransition({ type: "reasoning-delta", delta: "hm" }),
    ).toBeUndefined();
  });

  it("closes on every terminal shape of the call", () => {
    for (const type of [
      "tool-output-available",
      "tool-output-error",
      "tool-output-denied",
      "tool-input-error",
    ]) {
      expect(typingTransition({ type, toolCallId: "call-1" })).toEqual({
        open: false,
        toolCallId: "call-1",
      });
    }
  });

  it("ignores chunks with no call to attribute", () => {
    expect(typingTransition(undefined)).toBeUndefined();
    expect(typingTransition({ type: "tool-input-start" })).toBeUndefined();
  });

  it("ignores the later stages of a call it already opened", () => {
    // Opening is what starts the indicator; `tool-input-available` arrives
    // just before the message posts and would only make it flash.
    expect(
      typingTransition({
        type: "tool-input-available",
        toolCallId: "call-9",
        toolName: "workspace:send_message",
      }),
    ).toBeUndefined();
  });
});

describe("typing store conversation isolation", () => {
  beforeEach(() => {
    useTypingStore.setState({ typing: {} });
  });

  it("returns only the members typing in the requested conversation", () => {
    const store = useTypingStore.getState();
    store.startTyping("call-dm", "agent:sage", "conversation:dm:sage");
    store.startTyping("call-channel", "agent:patch", "conversation:general");

    expect(
      useTypingStore.getState().typingMemberIds("conversation:dm:sage"),
    ).toEqual(["agent:sage"]);
    expect(
      useTypingStore.getState().typingMemberIds("conversation:general"),
    ).toEqual(["agent:patch"]);
  });

  it("deduplicates one member's concurrent calls within a conversation", () => {
    const store = useTypingStore.getState();
    store.startTyping("call-1", "agent:sage", "conversation:dm:sage");
    store.startTyping("call-2", "agent:sage", "conversation:dm:sage");

    expect(
      useTypingStore.getState().typingMemberIds("conversation:dm:sage"),
    ).toEqual(["agent:sage"]);

    store.stopTyping("call-1");
    expect(
      useTypingStore.getState().typingMemberIds("conversation:dm:sage"),
    ).toEqual(["agent:sage"]);
    store.stopTyping("call-2");
    expect(
      useTypingStore.getState().typingMemberIds("conversation:dm:sage"),
    ).toEqual([]);
  });
});
