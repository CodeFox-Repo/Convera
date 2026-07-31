import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertSupportedAutomationNodeVersion,
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

  it.each(["20.20.2", "22.18.0", "24.4.1"])(
    "accepts supported Node %s",
    (version) => {
      expect(() => assertSupportedAutomationNodeVersion(version)).not.toThrow();
    },
  );

  it.each(["19.9.0", "26.0.0", "invalid"])(
    "rejects unsupported Node %s",
    (version) => {
      expect(() => assertSupportedAutomationNodeVersion(version)).toThrow(
        /requires Node 20-24/,
      );
    },
  );
});
