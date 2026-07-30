import { describe, expect, it } from "vitest";
import {
  resolveConversationProviderSelection,
  resolveNativeProviderSelection,
} from "./provider-selection";

describe("conversation provider selection", () => {
  const defaultSelection = {
    configId: "claude-code" as const,
    modelId: "default",
  };

  it("uses a conversation provider independently of the new-chat default", () => {
    expect(
      resolveConversationProviderSelection(
        {
          activeProviderId: "codex-cli",
          activeModelId: "gpt-5",
        },
        defaultSelection,
      ),
    ).toEqual({ configId: "codex-cli", modelId: "gpt-5" });
  });

  it("falls back to the new-chat default for legacy conversation data", () => {
    expect(
      resolveConversationProviderSelection(
        {
          activeProviderId: "legacy-cloud",
          activeModelId: null,
        },
        defaultSelection,
      ),
    ).toEqual(defaultSelection);
  });

  it("never routes a legacy custom config into a native provider", () => {
    expect(
      resolveNativeProviderSelection("legacy-cloud", "gpt-custom"),
    ).toEqual({
      configId: "claude-code",
      modelId: "default",
    });
  });
});
