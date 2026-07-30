import type { LocalAIChatRequest } from "@/shared/types/local-ai";
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
  type LocalAiProviderRun,
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

  async prepareRun(
    request: LocalAIChatRequest,
    status: LocalAiProviderStatus,
    context: Parameters<LocalAiProviderAdapter["prepareRun"]>[2],
  ): Promise<LocalAiProviderRun> {
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

    const model = this.provider(
      resolveLocalModelId(request.modelId, status.defaultModel),
      {
        pathToClaudeCodeExecutable: status.executablePath,
        cwd: request.options?.cwd,
        resume: context.session?.nativeSessionId,
        mcpServers: mcpServer ? { convera: mcpServer } : undefined,
        allowedTools: context.tools.map(
          (definition) => `mcp__convera__${definition.name}`,
        ),
      },
    );
    return {
      model,
      getNativeSessionId(metadata) {
        const nativeSessionId = metadata?.["claude-code"]?.sessionId;
        if (
          typeof nativeSessionId !== "string" ||
          nativeSessionId.trim().length === 0
        ) {
          throw Object.assign(
            new Error("Claude Code did not return a session id."),
            { code: "LOCAL_AI_SESSION_METADATA_INVALID" },
          );
        }
        return nativeSessionId;
      },
    };
  }

  async dispose(): Promise<void> {
    // Claude Agent SDK processes are request-scoped and use AbortSignal.
  }
}
