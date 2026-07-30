import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type { LanguageModel } from "ai";
import {
  createClaudeCode,
  createSdkMcpServer,
  tool as createClaudeTool,
} from "ai-sdk-provider-claude-code";
import { loadClaudeEnvironment } from "../claude-environment";
import { probeCliProvider } from "../cli-probe";
import {
  resolveLocalModelId,
  type LocalAiProviderAdapter,
} from "../provider-adapter";
import { toMcpToolResult } from "../tool-result";
import type { LocalAiProviderStatus } from "../types";

export class ClaudeCodeAdapter implements LocalAiProviderAdapter {
  readonly id = "claude-code" as const;

  private readonly provider = createClaudeCode({
    defaultSettings: {
      // Do not silently inherit machine-wide or repository instructions.
      settingSources: [],
      permissionMode: "default",
      // Tool wiring is a separate, approval-aware integration. Text chat starts
      // without implicitly granting local access.
      tools: [],
      maxTurns: 12,
      logger: false,
      // Some local Claude subscriptions store their auth/base URL in the
      // user settings env block. Load only those environment entries without
      // enabling user hooks, permissions, tools, or project instructions.
      sdkOptions: {
        env: loadClaudeEnvironment(),
      },
    },
  });

  getStatus(): Promise<LocalAiProviderStatus> {
    return probeCliProvider(this.id);
  }

  async createModel(
    request: LocalAIChatRequest,
    status: LocalAiProviderStatus,
    context: Parameters<LocalAiProviderAdapter["createModel"]>[2],
  ): Promise<LanguageModel> {
    const tools = context.tools.map((definition) =>
      createClaudeTool(
        definition.name,
        definition.description,
        definition.inputShape,
        async (input) => {
          try {
            const output = await definition.execute(input);
            return toMcpToolResult(output);
          } catch (error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: error instanceof Error ? error.message : String(error),
                },
              ],
              isError: true,
            };
          }
        },
      ),
    );
    const mcpServer =
      tools.length > 0
        ? createSdkMcpServer({ name: "convera", tools })
        : undefined;
    const nativeMcpServers = Object.fromEntries(
      Object.entries(context.nativeMcpServers).map(([serverName, server]) => [
        serverName,
        {
          type: "stdio" as const,
          command: server.command,
          args: server.args,
          ...(server.env ? { env: server.env } : {}),
        },
      ]),
    );
    const mcpServers = {
      ...nativeMcpServers,
      ...(mcpServer ? { convera: mcpServer } : {}),
    };
    const nativeAllowedTools = Object.entries(context.nativeMcpServers).flatMap(
      ([serverName, server]) =>
        server.toolNames.map((toolName) => `mcp__${serverName}__${toolName}`),
    );

    return this.provider(
      resolveLocalModelId(request.modelId, status.defaultModel),
      {
        pathToClaudeCodeExecutable: status.executablePath,
        cwd: request.options?.cwd,
        mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
        allowedTools: [
          ...context.tools.map(
            (definition) => `mcp__convera__${definition.name}`,
          ),
          ...nativeAllowedTools,
        ],
      },
    );
  }

  async dispose(): Promise<void> {
    // Claude Agent SDK processes are request-scoped and use AbortSignal.
  }
}
