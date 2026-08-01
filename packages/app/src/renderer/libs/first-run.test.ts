// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  composeChannelPrompts,
  dismissMentionHint,
  isMentionHintDismissed,
} from "./first-run";

describe("composeChannelPrompts", () => {
  it("matches a starter room through its emoji and offers both ways to address it", () => {
    expect(
      composeChannelPrompts({
        channelName: "🔍 code-review",
        agentNames: ["Elena"],
      }),
    ).toEqual(["@Elena review this diff:", "Is this change safe to ship?"]);
  });

  it("keeps matching a room the user renamed around the keyword", () => {
    expect(
      composeChannelPrompts({
        channelName: "Team Announcements (old)",
        agentNames: ["Noah", "Mika"],
      })[0],
    ).toBe("@Noah what kind of work should I send your way?");
  });

  it("names the first agent in the roster, which is the room's specialist", () => {
    expect(
      composeChannelPrompts({
        channelName: "🐛 debugging",
        agentNames: ["Mika", "Elena"],
      })[0],
    ).toContain("@Mika");
  });

  it("falls back to a generic room, still teaching both mechanics", () => {
    const prompts = composeChannelPrompts({
      channelName: "launch-swarm",
      agentNames: ["Vera"],
    });
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("@Vera");
    expect(prompts[1]).not.toContain("@");
  });

  it("never suggests mentioning somebody who is not in the room", () => {
    expect(
      composeChannelPrompts({ channelName: "📖 docs", agentNames: [] }),
    ).toEqual(["Who is this page for?"]);
  });
});

/**
 * jsdom's own localStorage is unavailable under this Node (its experimental
 * stub shadows it and reads back undefined), so the test supplies one.
 */
function installStorage(overrides: Partial<Storage> = {}) {
  const entries = new Map<string, string>();
  const store = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    ...overrides,
  };
  Object.defineProperty(window, "localStorage", {
    value: store,
    configurable: true,
  });
}

describe("the composer hint's dismissed flag", () => {
  beforeEach(() => {
    installStorage();
  });

  it("shows on a fresh install and never again once dismissed", () => {
    expect(isMentionHintDismissed()).toBe(false);
    dismissMentionHint();
    expect(isMentionHintDismissed()).toBe(true);
    // The point of the flag: a reload is a fresh read of the same storage.
    expect(isMentionHintDismissed()).toBe(true);
  });

  it("stays hidden rather than flickering back when storage cannot be read", () => {
    installStorage({
      getItem: () => {
        throw new Error("denied");
      },
    });
    expect(isMentionHintDismissed()).toBe(true);
  });

  it("still closes when the write is refused, instead of throwing at the click", () => {
    installStorage({
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => dismissMentionHint()).not.toThrow();
  });

  it("treats a missing storage as already dismissed", () => {
    Object.defineProperty(window, "localStorage", {
      value: undefined,
      configurable: true,
    });
    expect(isMentionHintDismissed()).toBe(true);
  });
});
