import { describe, expect, it } from "vitest";
import { groupRepliesByParent } from "../reply-threads";

describe("groupRepliesByParent", () => {
  it("collects replies under their parent in transcript order", () => {
    const groups = groupRepliesByParent([
      { id: "a" },
      { id: "b", replyToMessageId: "a" },
      { id: "c" },
      { id: "d", replyToMessageId: "a" },
      { id: "e", replyToMessageId: "c" },
    ]);

    expect(groups.get("a")).toEqual(["b", "d"]);
    expect(groups.get("c")).toEqual(["e"]);
    expect(groups.has("b")).toBe(false);
  });

  it("ignores messages that reply to nothing or to themselves", () => {
    const groups = groupRepliesByParent([
      { id: "a" },
      { id: "b", replyToMessageId: "b" },
    ]);

    expect(groups.size).toBe(0);
  });

  it("keeps replies whose parent is outside the loaded window", () => {
    // Older history is paged out; the reply still points somewhere, and the
    // renderer simply never asks about a parent it is not drawing.
    const groups = groupRepliesByParent([
      { id: "b", replyToMessageId: "gone" },
    ]);

    expect(groups.get("gone")).toEqual(["b"]);
  });
});
