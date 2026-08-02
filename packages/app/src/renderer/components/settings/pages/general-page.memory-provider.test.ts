import { describe, expect, it } from "vitest";
import {
  MEMORY_CURATOR_OPTIONS,
  createMemoryCuratorUpdate,
} from "./memory-curator-options";

describe("memory curator settings", () => {
  it("offers every registered provider plus off and follow-active", () => {
    expect(MEMORY_CURATOR_OPTIONS).toEqual([
      { value: "off", label: "Off" },
      { value: "claude-code", label: "Claude Code" },
      { value: "codex-cli", label: "Codex" },
      { value: "openai-api", label: "OpenAI API" },
      { value: "fireworks-api", label: "Fireworks" },
      { value: "follow-active", label: "Follow active provider" },
    ]);
  });

  it("rejects values outside the provider registry", () => {
    expect(createMemoryCuratorUpdate("openai-api")).toEqual({
      subconsciousProvider: "openai-api",
    });
    expect(createMemoryCuratorUpdate("hardcoded-provider")).toBeNull();
  });
});
