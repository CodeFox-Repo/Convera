import { describe, expect, it } from "vitest";
import { normalizeDisplayName, squareCrop } from "./profile-avatar";

describe("profile avatar helpers", () => {
  it("rejects names that would render as a blank row", () => {
    expect(normalizeDisplayName("")).toBeNull();
    expect(normalizeDisplayName("   ")).toBeNull();
    expect(normalizeDisplayName("\n\t")).toBeNull();
    expect(normalizeDisplayName("  Jackson  ")).toBe("Jackson");
  });

  it("crops the centre square of a non-square photo", () => {
    expect(squareCrop(400, 300)).toEqual({ x: 50, y: 0, size: 300 });
    expect(squareCrop(300, 400)).toEqual({ x: 0, y: 50, size: 300 });
    expect(squareCrop(200, 200)).toEqual({ x: 0, y: 0, size: 200 });
  });
});
