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
  /**
   * False on purpose. Checked in @anthropic-ai/claude-agent-sdk 0.1.77 and
   * ai-sdk-provider-claude-code 3.1.0:
   *
   * - `sandbox: SandboxSettings` is real and OS-level (seatbelt on macOS,
   *   bubblewrap on Linux), but it only wraps Bash subprocesses. The built-in
   *   file tools run inside the CLI and are governed by the permission prompt,
   *   not the kernel.
   * - Its writable set is not settable from SDK options: `SandboxSettings` has
   *   no filesystem key, and the CLI derives allowed writes from cwd plus
   *   `permissions.allow` rules in on-disk settings, which `settingSources: []`
   *   deliberately does not load.
   * - It self-disables when its ripgrep dependency check fails, silently.
   *
   * `additionalDirectories` and `allowedTools` widen access rather than cage it.
   * So the settings below are defence in depth, and `resolveInSandbox` remains
   * the boundary that actually has to hold.
   */
  readonly enforcesSandbox = false;

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
    const textOnly = context.executionPolicy === "text-only";
    const exposedTools = textOnly ? [] : context.tools;
    const tools = exposedTools.map((definition) =>
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
    const nativeMcpDefinitions = context.nativeMcpServers ?? {};
    const nativeMcpServers = textOnly
      ? {}
      : Object.fromEntries(
          Object.entries(nativeMcpDefinitions).map(([serverName, server]) => [
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
    const nativeAllowedTools = textOnly
      ? []
      : Object.entries(nativeMcpDefinitions).flatMap(([serverName, server]) =>
          server.toolNames.map((toolName) => `mcp__${serverName}__${toolName}`),
        );

    const fallbackRoot = request.options?.cwd ?? process.cwd();
    const sandbox = context.sandbox ?? {
      root: fallbackRoot,
      writableRoots: [fallbackRoot],
      networkAccess: false,
    };
    const model = this.provider(
      resolveLocalModelId(request.modelId, status.defaultModel),
      {
        pathToClaudeCodeExecutable: status.executablePath,
        cwd: sandbox.writableRoots[0] ?? sandbox.root,
        resume: context.session?.nativeSessionId,
        mcpServers:
          Object.keys(mcpServers).length > 0
            ? mcpServers
            : textOnly
              ? {}
              : undefined,
        allowedTools: [
          ...exposedTools.map(
            (definition) => `mcp__convera__${definition.name}`,
          ),
          ...nativeAllowedTools,
        ],
        ...(textOnly
          ? {
              permissionMode: "dontAsk" as const,
              tools: [],
              settingSources: [],
              plugins: [],
              canUseTool: async () => ({
                behavior: "deny" as const,
                message:
                  "This subscription turn is restricted to text generation.",
                interrupt: true,
              }),
            }
          : !sandbox.networkAccess
            ? { sandbox: { enabled: true, network: { allowedDomains: [] } } }
            : {}),
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
