import { describe, expect, it } from "vitest";
import {
  createRendererStartupProviderArgument,
  parseStartupProvider,
} from "./startup-provider";

describe("startup provider arguments", () => {
  it.each([
    ["cc", "claude-code"],
    ["--cc", "claude-code"],
    ["codex", "codex-cli"],
    ["--codex", "codex-cli"],
  ] as const)("maps %s to %s", (argument, expected) => {
    expect(parseStartupProvider(["electron", ".", argument])).toBe(expected);
  });

  it("ignores unrelated and lookalike arguments", () => {
    expect(parseStartupProvider(["electron", ".", "CC", "codex.json"])).toBe(
      null,
    );
  });

  it("uses the last recognized provider argument", () => {
    expect(parseStartupProvider(["cc", "codex"])).toBe("codex-cli");
    expect(parseStartupProvider(["codex", "cc"])).toBe("claude-code");
  });

  it("round-trips the internal renderer argument", () => {
    const argument = createRendererStartupProviderArgument("claude-code");
    expect(parseStartupProvider([argument])).toBe("claude-code");
  });

  it("rejects an unsupported internal provider", () => {
    expect(
      parseStartupProvider(["--convera-startup-provider=openai-api"]),
    ).toBe(null);
  });
});
