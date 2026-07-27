import { describe, expect, it, afterEach } from "vitest";
import robot from "@hurdlegroup/robotjs";
import { __setLastShot, toLogical } from "./screen";

afterEach(() => __setLastShot(null));

describe("toLogical", () => {
  const screen = robot.getScreenSize();

  it("is the identity when the screenshot was taken at logical size", () => {
    __setLastShot({ width: screen.width, height: screen.height });
    expect(toLogical(0, 0)).toEqual({ x: 0, y: 0 });
    expect(toLogical(100, 200)).toEqual({ x: 100, y: 200 });
  });

  it("scales up when MAX_LONG_EDGE forced the screenshot smaller", () => {
    __setLastShot({ width: screen.width / 2, height: screen.height / 2 });
    expect(toLogical(100, 100)).toEqual({ x: 200, y: 200 });
  });

  it("keeps the far corner inside the screen instead of one pixel past it", () => {
    __setLastShot({ width: screen.width, height: screen.height });
    const corner = toLogical(screen.width, screen.height);
    expect(corner.x).toBe(screen.width - 1);
    expect(corner.y).toBe(screen.height - 1);
  });

  it("clamps negative coordinates rather than driving the cursor off-screen", () => {
    __setLastShot({ width: screen.width, height: screen.height });
    expect(toLogical(-50, -50)).toEqual({ x: 0, y: 0 });
  });
});
