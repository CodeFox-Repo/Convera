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

    const sandbox = context.sandbox;

    return this.provider(
      resolveLocalModelId(request.modelId, status.defaultModel),
      {
        pathToClaudeCodeExecutable: status.executablePath,
        cwd: sandbox
          ? (sandbox.writableRoots[0] ?? sandbox.root)
          : request.options?.cwd,
        mcpServers: mcpServer ? { convera: mcpServer } : undefined,
        allowedTools: context.tools.map(
          (definition) => `mcp__convera__${definition.name}`,
        ),
        // The one part of the sandbox contract the SDK can enforce: with an
        // empty allow list, sandboxed subprocesses get no network at all.
        ...(sandbox && !sandbox.networkAccess
          ? { sandbox: { enabled: true, network: { allowedDomains: [] } } }
          : {}),
      },
    );
  }

  async dispose(): Promise<void> {
    // Claude Agent SDK processes are request-scoped and use AbortSignal.
  }
}
