import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import { describe, expect, it } from "vitest";
import { ZodEffects } from "zod";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../provider-descriptors";
import { CodexCliAdapter } from "../providers/codex-cli";
import type { LocalAiProviderStatus } from "../types";

describe("CodexCliAdapter", () => {
  it("loads app-server with Zod 3 without retaining the upstream shim", async () => {
    const effectsPrototype =
      ZodEffects.prototype as typeof ZodEffects.prototype & {
        passthrough?: unknown;
      };
    expect(effectsPrototype.passthrough).toBeUndefined();

    const adapter = new CodexCliAdapter();
    const request: LocalAIChatRequest = {
      requestId: "test",
      providerId: "codex-cli",
      messages: [{ role: "user", content: "hello" }],
    };
    const status: LocalAiProviderStatus = {
      ...LOCAL_AI_PROVIDER_DESCRIPTORS["codex-cli"],
      available: true,
      authenticated: true,
      executablePath: "/test/codex",
      checkedAt: new Date(0).toISOString(),
    };

    const model = await adapter.createModel(request, status, {
      tools: [],
      requestInteraction: async () => ({ approved: false }),
    });

    expect(model).toBeDefined();
    expect(effectsPrototype.passthrough).toBeUndefined();
    await adapter.dispose();
  });
});
