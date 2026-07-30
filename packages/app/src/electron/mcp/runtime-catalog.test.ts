import type { LanguageModel } from "ai";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalAiProviderAdapter } from "../ai/provider-adapter";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../ai/provider-descriptors";
import { LocalAiRuntime } from "../ai/runtime";
import { MCPConnection } from "./connection";
import { MCPHub } from "./hub";
import { cleanupMCPHub, getAgentToolGroups, initializeMCPHub } from "./index";

vi.mock("./managed-servers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./managed-servers")>()),
  resolveManagedStdioExecutable: vi.fn(() => "/test/cua-driver"),
}));

describe("main-process agent tool catalog", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupMCPHub();
  });

  it("does not restart managed MCP connections when the catalog is requested again", async () => {
    const initialize = vi
      .spyOn(MCPHub.prototype, "initialize")
      .mockResolvedValue();
    const configPath = join(
      tmpdir(),
      `convera-mcp-idempotent-${process.pid}.json`,
    );

    const first = await initializeMCPHub(configPath);
    const second = await initializeMCPHub(configPath);

    expect(second).toBe(first);
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it.each(["codex-cli", "claude-code"] as const)(
    "provides connected Cua MCP tools and builtins to %s",
    async (providerId) => {
      vi.spyOn(MCPConnection.prototype, "connect").mockResolvedValue();
      vi.spyOn(MCPConnection.prototype, "disconnect").mockResolvedValue();
      vi.spyOn(MCPConnection.prototype, "getServerInfo").mockReturnValue({
        name: "cua",
        displayName: "Cua",
        description: "Convera-managed Cua Driver computer-use tools",
        transportType: "stdio",
        status: "connected",
        capabilities: {
          tools: [
            {
              name: "screenshot",
              description: "Capture the current desktop",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          resources: [],
          resourceTemplates: [],
          prompts: [],
        },
        uptime: 0,
        managed: true,
      });

      const createModel = vi.fn<LocalAiProviderAdapter["createModel"]>(
        async () => ({}) as LanguageModel,
      );
      const adapter: LocalAiProviderAdapter = {
        id: providerId,
        getStatus: vi.fn(async () => ({
          ...LOCAL_AI_PROVIDER_DESCRIPTORS[providerId],
          available: true,
          authenticated: true,
          checkedAt: new Date(0).toISOString(),
        })),
        createModel,
        dispose: vi.fn(async () => undefined),
      };
      const configPath = join(
        tmpdir(),
        `convera-mcp-runtime-catalog-${process.pid}.json`,
      );
      const runtime = new LocalAiRuntime({
        adapters: [adapter],
        getToolGroups: async () => {
          await initializeMCPHub(configPath);
          return getAgentToolGroups();
        },
        streamInvoker: () => ({
          toUIMessageStream: async function* () {
            yield { type: "finish" as const, finishReason: "stop" as const };
          },
        }),
      });

      await runtime.startChat(
        {
          requestId: "runtime-catalog",
          providerId,
          messages: [{ role: "user", content: "List available tools." }],
        },
        vi.fn(),
      );

      const context = createModel.mock.calls[0]?.[2];
      expect(context?.tools.map((tool) => tool.qualifiedName)).toEqual([
        "builtin:ask_user_input",
        "builtin:execute_command",
        "builtin:web_fetch",
      ]);
      expect(context?.nativeMcpServers).toMatchObject({
        cua: {
          transport: "stdio",
          command: "/test/cua-driver",
          args: ["mcp"],
          toolNames: ["screenshot"],
        },
      });
      expect(context?.nativeMcpServers.cua.env?.PATH).toContain(
        join(homedir(), ".local", "bin"),
      );
      expect(context?.tools.map((tool) => tool.qualifiedName)).not.toContain(
        "builtin:computer_control",
      );
      expect(context?.tools.map((tool) => tool.qualifiedName)).not.toContain(
        "cua:screenshot",
      );

      await runtime.dispose();
    },
  );
});
