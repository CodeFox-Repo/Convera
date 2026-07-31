import { beforeEach, describe, expect, it } from "vitest";
import { useTypingStore } from "./typing-store";

describe("typing store conversation isolation", () => {
  beforeEach(() => {
    useTypingStore.setState({ typing: {} });
  });

  it("returns only the members typing in the requested conversation", () => {
    const store = useTypingStore.getState();
    store.startTyping("request-dm", "agent:sage", "conversation:dm:sage");
    store.startTyping("request-channel", "agent:patch", "conversation:general");

    expect(
      useTypingStore.getState().typingMemberIds("conversation:dm:sage"),
    ).toEqual(["agent:sage"]);
    expect(
      useTypingStore.getState().typingMemberIds("conversation:general"),
    ).toEqual(["agent:patch"]);
  });

  it("deduplicates one member's concurrent requests within a conversation", () => {
    const store = useTypingStore.getState();
    store.startTyping("request-1", "agent:sage", "conversation:dm:sage");
    store.startTyping("request-2", "agent:sage", "conversation:dm:sage");

    expect(
      useTypingStore.getState().typingMemberIds("conversation:dm:sage"),
    ).toEqual(["agent:sage"]);

    store.stopTyping("request-1");
    expect(
      useTypingStore.getState().typingMemberIds("conversation:dm:sage"),
    ).toEqual(["agent:sage"]);
    store.stopTyping("request-2");
    expect(
      useTypingStore.getState().typingMemberIds("conversation:dm:sage"),
    ).toEqual([]);
  });
});
