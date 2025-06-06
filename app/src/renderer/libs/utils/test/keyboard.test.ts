import { describe, it, expect } from "vitest";
import { parseShortcut, matchesShortcut } from "../keyboard-utils";

describe("keyboard utils", () => {
  it("parses shortcut with modifiers", () => {
    const res = parseShortcut("Ctrl+Shift+A");
    expect(res).toEqual({ key: "a", ctrlKey: true, shiftKey: true });
  });

  it("matches shortcut events", () => {
    const event = {
      key: "b",
      metaKey: true,
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
    } as unknown as KeyboardEvent;
    expect(matchesShortcut(event, "Meta+Alt+B")).toBe(true);
  });

  it("fails when modifier does not match", () => {
    const event = {
      key: "c",
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
    } as unknown as KeyboardEvent;
    expect(matchesShortcut(event, "Ctrl+Shift+C")).toBe(false);
  });
});
