import { describe, expect, it } from "vitest";
import { pickClaudeEnvironment } from "../claude-environment";

describe("pickClaudeEnvironment", () => {
  it("passes only Claude and Anthropic environment settings", () => {
    expect(
      pickClaudeEnvironment({
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:8317",
        CLAUDE_CODE_USE_BEDROCK: "1",
        PATH: "/untrusted/bin",
        NODE_OPTIONS: "--require malicious.js",
        hooks: "not-an-environment-setting",
        INVALID_NUMBER: 1,
      }),
    ).toEqual({
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:8317",
      CLAUDE_CODE_USE_BEDROCK: "1",
    });
  });

  it("returns an empty object for invalid settings", () => {
    expect(pickClaudeEnvironment(null)).toEqual({});
    expect(pickClaudeEnvironment("not-an-object")).toEqual({});
  });
});
