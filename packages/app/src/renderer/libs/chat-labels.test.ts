import { describe, expect, it } from "vitest";
import {
  composeChannelAgentLine,
  composeInputPlaceholder,
  resolveSenderName,
} from "./chat-labels";

describe("resolveSenderName", () => {
  it("prefers the resolved member name", () => {
    expect(
      resolveSenderName({
        senderName: "Fizz",
        isUser: false,
        agentName: "Honey",
      }),
    ).toBe("Fizz");
  });

  it("names the user when the row is theirs", () => {
    expect(resolveSenderName({ isUser: true })).toBe("You");
  });

  it("falls back to the conversation's agent, never the product name", () => {
    expect(resolveSenderName({ isUser: false, agentName: "Honey" })).toBe(
      "Honey",
    );
    expect(resolveSenderName({ isUser: false, agentName: null })).toBe(
      "Assistant",
    );
    expect(resolveSenderName({ isUser: false })).toBe("Assistant");
  });
});

describe("composeInputPlaceholder", () => {
  it("addresses the channel when there is one", () => {
    expect(
      composeInputPlaceholder({
        channelName: "flight-path",
        agentName: "Fizz",
      }),
    ).toBe("Message #flight-path");
  });

  it("addresses the agent in a plain chat", () => {
    expect(composeInputPlaceholder({ agentName: "Fizz" })).toBe(
      "Message @Fizz",
    );
  });

  it("stays generic when nobody is bound", () => {
    expect(composeInputPlaceholder({})).toBe("Message...");
    expect(
      composeInputPlaceholder({ channelName: null, agentName: null }),
    ).toBe("Message...");
  });
});

describe("composeChannelAgentLine", () => {
  it("lists the agents as mentionable names", () => {
    expect(composeChannelAgentLine(["Fizz", "Honey"])).toBe(
      "Agents here: @Fizz, @Honey — mention one to bring them in.",
    );
  });

  it("says nothing when the room has no agents yet", () => {
    expect(composeChannelAgentLine([])).toBeNull();
  });
});
