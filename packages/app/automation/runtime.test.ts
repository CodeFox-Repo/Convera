import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chromiumVersion,
  electronBinaryPath,
  normalizeElectronBinaryPath,
} from "./runtime.js";

describe("automation runtime discovery", () => {
  it("normalizes whitespace accidentally retained by Electron path metadata", () => {
    expect(normalizeElectronBinaryPath(" /tmp/Electron\n")).toBe(
      "/tmp/Electron",
    );
    expect(() => normalizeElectronBinaryPath(" \n ")).toThrow(
      "Electron did not provide an executable path",
    );
  });

  it("discovers an executable Electron and its Chromium version", () => {
    expect(existsSync(electronBinaryPath())).toBe(true);
    expect(chromiumVersion()).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });
});
