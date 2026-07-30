import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import { describe, expect, it, vi } from "vitest";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../provider-descriptors";
import { ClaudeCodeAdapter } from "../providers/claude-code";
import type { LocalAiProviderStatus } from "../types";

const mocks = vi.hoisted(() => {
  const model = {};
  const provider = vi.fn(() => model);
  return {
    model,
    provider,
    createClaudeCode: vi.fn(() => provider),
    createSdkMcpServer: vi.fn(),
    tool: vi.fn(),
  };
});

vi.mock("ai-sdk-provider-claude-code", () => ({
  createClaudeCode: mocks.createClaudeCode,
  createSdkMcpServer: mocks.createSdkMcpServer,
  tool: mocks.tool,
}));

function request(): LocalAIChatRequest {
  return {
    requestId: "request",
    conversationId: "conversation",
    turnId: "turn",
    providerId: "claude-code",
    operation: {
      kind: "append",
      message: { role: "user", content: "continue" },
    },
    options: { cwd: "/workspace" },
  };
}

function status(): LocalAiProviderStatus {
  return {
    ...LOCAL_AI_PROVIDER_DESCRIPTORS["claude-code"],
    available: true,
    authenticated: true,
    executablePath: "/test/claude",
    checkedAt: new Date(0).toISOString(),
  };
}

describe("ClaudeCodeAdapter sessions", () => {
  it("resumes the previous session and captures the latest returned session id", async () => {
    const adapter = new ClaudeCodeAdapter();
    const first = await adapter.prepareRun(request(), status(), {
      tools: [],
      requestInteraction: async () => ({ approved: false }),
    });
    expect(mocks.provider).toHaveBeenLastCalledWith(
      "sonnet",
      expect.objectContaining({
        cwd: "/workspace",
        resume: undefined,
      }),
    );
    expect(
      first.getNativeSessionId({
        "claude-code": { sessionId: "session-first" },
      }),
    ).toBe("session-first");

    const resumed = await adapter.prepareRun(request(), status(), {
      session: {
        conversationId: "conversation",
        providerId: "claude-code",
        revision: 0,
        nativeSessionId: "session-first",
        cwd: "/workspace",
        stale: false,
        memoryCursors: {},
        updatedAt: new Date(0).toISOString(),
      },
      tools: [],
      requestInteraction: async () => ({ approved: false }),
    });
    expect(mocks.provider).toHaveBeenLastCalledWith(
      "sonnet",
      expect.objectContaining({
        resume: "session-first",
      }),
    );
    expect(
      resumed.getNativeSessionId({
        "claude-code": { sessionId: "session-second" },
      }),
    ).toBe("session-second");
    expect(() => resumed.getNativeSessionId(undefined)).toThrow("session id");
  });
});
