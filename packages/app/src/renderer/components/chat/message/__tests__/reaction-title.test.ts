// The module under test is a component file, so importing it opens Dexie.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { reactionTitle } from "../message-row";

// The literal rather than the export: importing it pulls Dexie into a test
// that only formats a string.
const LOCAL_HUMAN_MEMBER_ID = "me";

const NAMES: Record<string, string> = {
  "agent:fizz": "Fizz",
  "agent:buzz": "Buzz",
};
const nameOf = (id: string) => NAMES[id];

describe("reactionTitle", () => {
  it("names the people who reacted rather than counting them", () => {
    expect(reactionTitle("👍", ["agent:fizz", "agent:buzz"], nameOf)).toBe(
      "Fizz and Buzz reacted with 👍",
    );
  });

  it("puts you first and calls you You", () => {
    expect(
      reactionTitle("👍", ["agent:fizz", LOCAL_HUMAN_MEMBER_ID], nameOf),
    ).toBe("You and Fizz reacted with 👍");
  });

  it("reads as a list once there are three", () => {
    expect(
      reactionTitle(
        "🎉",
        [LOCAL_HUMAN_MEMBER_ID, "agent:fizz", "agent:buzz"],
        nameOf,
      ),
    ).toBe("You, Fizz and Buzz reacted with 🎉");
  });

  it("keeps a departed member counted under their id", () => {
    expect(reactionTitle("👀", ["agent:gone"], nameOf)).toBe(
      "agent:gone reacted with 👀",
    );
  });
});
