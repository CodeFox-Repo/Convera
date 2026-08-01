/**
 * The invariant worth locking down: a search hit's row does not exist when the
 * click happens — the conversation has to load first — so revealing has to wait
 * for it rather than miss it.
 */

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { revealMessage } from "../reveal-message";

function row(messageId: string) {
  const element = document.createElement("div");
  element.setAttribute("data-message-id", messageId);
  // jsdom implements neither; both are decoration, not the behaviour under test.
  element.scrollIntoView = vi.fn();
  element.animate = vi.fn() as unknown as Element["animate"];
  document.body.append(element);
  return element;
}

/** Drains the requestAnimationFrame queue the poll loop schedules onto. */
async function flushFrames(count = 6) {
  for (let i = 0; i < count; i++) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("revealMessage", () => {
  it("scrolls to a row that is already present", async () => {
    const target = row("m1");

    revealMessage("m1");
    await flushFrames();

    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("waits for a row that mounts after the click", async () => {
    revealMessage("m-late");
    await flushFrames(2);

    // The transcript has now swapped in, the way it does after navigating.
    const target = row("m-late");
    await flushFrames();

    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it("gives up instead of polling forever when the row never arrives", async () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame");

    revealMessage("m-missing", { timeoutMs: 0 });
    await flushFrames(2);

    // One frame is the caller's own flush; the loop itself scheduled nothing.
    expect(raf.mock.calls.length).toBeLessThan(3);
    raf.mockRestore();
  });

  it("does not touch a different message's row", async () => {
    const other = row("m-other");
    row("m1");

    revealMessage("m1");
    await flushFrames();

    expect(other.scrollIntoView).not.toHaveBeenCalled();
  });
});
