import { describe, expect, it } from "vitest";
import { createTextDrip } from "./text-drip";

/** Drives the drip on a controllable clock instead of animation frames. */
function createHarness() {
  const pending: Array<(time: number) => void> = [];
  const out: string[] = [];
  let now = 0;

  const drip = createTextDrip({
    onText: (text) => out.push(text),
    scheduler: (callback) => pending.push(callback),
    cancelScheduled: () => pending.splice(0, pending.length),
  });

  return {
    drip,
    out,
    text: () => out.join(""),
    /** Advance one frame. */
    frame(ms = 16) {
      now += ms;
      pending.splice(0, pending.length).forEach((callback) => callback(now));
    },
    pendingCount: () => pending.length,
  };
}

describe("createTextDrip", () => {
  it("releases a burst gradually instead of all at once", () => {
    const h = createHarness();
    h.drip.push("a".repeat(100));

    h.frame(); // first frame establishes the clock, emits nothing yet
    h.frame();
    const afterTwo = h.text().length;

    expect(afterTwo).toBeGreaterThan(0);
    expect(afterTwo).toBeLessThan(100); // still dripping, not pasted
  });

  it("eventually emits every character, in order, exactly once", () => {
    const h = createHarness();
    h.drip.push("hello ");
    h.drip.push("streaming ");
    h.drip.push("world");

    for (let i = 0; i < 200 && h.pendingCount(); i++) h.frame();

    expect(h.text()).toBe("hello streaming world");
  });

  it("flush emits the remainder immediately and stops further output", () => {
    const h = createHarness();
    h.drip.push("abcdefghij".repeat(10));
    h.frame();
    h.frame();

    h.drip.flush();
    expect(h.text()).toBe("abcdefghij".repeat(10));

    const settled = h.text();
    h.drip.push("ignored after flush");
    for (let i = 0; i < 10; i++) h.frame();
    expect(h.text()).toBe(settled);
  });

  it("cancel drops the buffer without emitting it", () => {
    const h = createHarness();
    h.drip.push("never rendered");
    h.drip.cancel();
    for (let i = 0; i < 10; i++) h.frame();
    expect(h.text()).toBe("");
  });

  it("drains a large backlog faster so it cannot fall behind", () => {
    const small = createHarness();
    small.drip.push("x".repeat(50));
    small.frame();
    small.frame(16);

    const large = createHarness();
    large.drip.push("x".repeat(5000));
    large.frame();
    large.frame(16);

    expect(large.out.at(-1)!.length).toBeGreaterThan(small.out.at(-1)!.length);
  });
});
