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
      conversationId: "conversation",
      turnId: "turn",
      providerId: "codex-cli",
      operation: {
        kind: "append",
        message: { role: "user", content: "hello" },
      },
    };
    const status: LocalAiProviderStatus = {
      ...LOCAL_AI_PROVIDER_DESCRIPTORS["codex-cli"],
      available: true,
      authenticated: true,
      executablePath: "/test/codex",
      checkedAt: new Date(0).toISOString(),
    };

    const run = await adapter.prepareRun(request, status, {
      tools: [],
      requestInteraction: async () => ({ approved: false }),
    });

    expect(run.model).toBeDefined();
    expect(run.providerOptions).toEqual({
      "codex-app-server": { threadMode: "persistent" },
    });
    expect(effectsPrototype.passthrough).toBeUndefined();
    await adapter.dispose();
  });

  it("starts a persistent thread and resumes the bound thread id", async () => {
    const adapter = new CodexCliAdapter();
    const request: LocalAIChatRequest = {
      requestId: "request",
      conversationId: "conversation",
      turnId: "turn",
      providerId: "codex-cli",
      operation: {
        kind: "append",
        message: { role: "user", content: "continue" },
      },
      options: { cwd: "/workspace" },
    };
    const status: LocalAiProviderStatus = {
      ...LOCAL_AI_PROVIDER_DESCRIPTORS["codex-cli"],
      available: true,
      authenticated: true,
      executablePath: "/test/codex",
      checkedAt: new Date(0).toISOString(),
    };

    const first = await adapter.prepareRun(request, status, {
      tools: [],
      requestInteraction: async () => ({ approved: false }),
    });
    expect(first.providerOptions).toEqual({
      "codex-app-server": { threadMode: "persistent" },
    });
    expect(
      first.getNativeSessionId({
        "codex-app-server": { threadId: "thread-new" },
      }),
    ).toBe("thread-new");

    const resumed = await adapter.prepareRun(request, status, {
      session: {
        conversationId: "conversation",
        providerId: "codex-cli",
        revision: 2,
        nativeSessionId: "thread-existing",
        cwd: "/workspace",
        stale: false,
        transcriptVersion: 2,
        memoryCursors: {},
        updatedAt: new Date(0).toISOString(),
      },
      tools: [],
      requestInteraction: async () => ({ approved: false }),
    });
    expect(resumed.providerOptions).toEqual({
      "codex-app-server": { threadId: "thread-existing" },
    });
    expect(() => resumed.getNativeSessionId(undefined)).toThrow(
      "persistent thread id",
    );

    await adapter.dispose();
  });
});
