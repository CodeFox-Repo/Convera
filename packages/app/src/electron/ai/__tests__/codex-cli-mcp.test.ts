import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../provider-descriptors";
import { CodexCliAdapter } from "../providers/codex-cli";
import type { LocalAiProviderStatus } from "../types";

const mocks = vi.hoisted(() => {
  const model = {};
  const provider = Object.assign(
    vi.fn(() => model),
    {
      close: vi.fn(async () => undefined),
      listModels: vi.fn(async () => ({
        models: [{ id: "gpt-test" }],
        defaultModel: { id: "gpt-test" },
      })),
    },
  );

  return {
    model,
    provider,
    createCodexAppServer: vi.fn(() => provider),
    createSdkMcpServer: vi.fn(() => ({ url: "http://127.0.0.1/mcp" })),
    tool: vi.fn((definition) => definition),
  };
});

vi.mock("ai-sdk-provider-codex-cli", () => ({
  createCodexAppServer: mocks.createCodexAppServer,
  createSdkMcpServer: mocks.createSdkMcpServer,
  tool: mocks.tool,
}));

describe("CodexCliAdapter MCP transport", () => {
  it("enables the RMCP client when Convera tools are attached", async () => {
    const adapter = new CodexCliAdapter();
    const request: LocalAIChatRequest = {
      requestId: "test",
      providerId: "codex-cli",
      modelId: "gpt-test",
      messages: [{ role: "user", content: "use a tool" }],
      options: { cwd: "/tmp/convera-test" },
    };
    const status: LocalAiProviderStatus = {
      ...LOCAL_AI_PROVIDER_DESCRIPTORS["codex-cli"],
      available: true,
      authenticated: true,
      executablePath: "/test/codex",
      defaultModel: "gpt-test",
      models: ["gpt-test"],
      checkedAt: new Date(0).toISOString(),
    };

    await adapter.createModel(request, status, {
      tools: [
        {
          name: "builtin__probe",
          qualifiedName: "builtin:probe",
          description: "Probe the local MCP bridge",
          inputSchema: {
            type: "object",
            properties: { value: { type: "string" } },
          },
          inputShape: { value: z.string() },
          inputValidator: z.object({ value: z.string() }),
          execute: vi.fn(async () => "PROBE_OK"),
        },
      ],
      requestInteraction: vi.fn(async () => ({ approved: false })),
    });

    const mcpServer = mocks.createSdkMcpServer.mock.results[0].value;
    expect(mocks.provider).toHaveBeenCalledWith(
      "gpt-test",
      expect.objectContaining({
        cwd: "/tmp/convera-test",
        mcpServers: { convera: mcpServer },
        rmcpClient: true,
      }),
    );

    await adapter.dispose();
  });
});
