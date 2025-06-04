import { describe, expect, it } from "vitest";
import { cn } from "../tailwind";

describe("cn", () => {
  it("merges class names and removes duplicates", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("ignores falsy values", () => {
    const shouldShow = false;
    expect(cn("hidden", shouldShow && "block", "text-red")).toBe(
      "hidden text-red",
    );
  });
});
