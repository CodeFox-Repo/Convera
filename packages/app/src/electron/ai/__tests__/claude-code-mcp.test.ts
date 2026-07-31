import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type { LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../provider-descriptors";
import { ClaudeCodeAdapter } from "../providers/claude-code";
import type { LocalAiProviderStatus } from "../types";

const mocks = vi.hoisted(() => {
  const model = {} as LanguageModel;
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

describe("ClaudeCodeAdapter MCP transport", () => {
  it("passes connected managed MCP servers to Claude without converting their tools", async () => {
    const adapter = new ClaudeCodeAdapter();
    const request: LocalAIChatRequest = {
      requestId: "native-mcp",
      conversationId: "conversation",
      turnId: "turn",
      providerId: "claude-code",
      modelId: "claude-test",
      operation: {
        kind: "append",
        message: { role: "user", content: "use cua" },
      },
      options: { cwd: "/tmp/convera-test" },
    };
    const status: LocalAiProviderStatus = {
      ...LOCAL_AI_PROVIDER_DESCRIPTORS["claude-code"],
      available: true,
      authenticated: true,
      executablePath: "/test/claude",
      defaultModel: "claude-test",
      models: ["claude-test"],
      checkedAt: new Date(0).toISOString(),
    };

    const run = await adapter.prepareRun(request, status, {
      tools: [],
      nativeMcpServers: {
        cua: {
          transport: "stdio",
          command: "cua-driver",
          args: ["mcp"],
          toolNames: ["screenshot"],
        },
      },
      requestInteraction: vi.fn(async () => ({ approved: false })),
    });

    expect(run.model).toBe(mocks.model);
    expect(mocks.provider).toHaveBeenCalledWith(
      "claude-test",
      expect.objectContaining({
        pathToClaudeCodeExecutable: "/test/claude",
        cwd: "/tmp/convera-test",
        mcpServers: {
          cua: {
            type: "stdio",
            command: "cua-driver",
            args: ["mcp"],
          },
        },
        allowedTools: ["mcp__cua__screenshot"],
      }),
    );
    expect(mocks.createSdkMcpServer).not.toHaveBeenCalled();
    expect(mocks.tool).not.toHaveBeenCalled();
  });
});
