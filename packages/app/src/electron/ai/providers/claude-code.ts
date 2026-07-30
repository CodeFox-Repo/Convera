import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type { LanguageModel } from "ai";
import { createClaudeCode } from "ai-sdk-provider-claude-code";
import { probeCliProvider } from "../cli-probe";
import type { LocalAiProviderAdapter } from "../provider-adapter";
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
      maxTurns: 1,
      logger: false,
    },
  });

  getStatus(): Promise<LocalAiProviderStatus> {
    return probeCliProvider(this.id);
  }

  async createModel(
    request: LocalAIChatRequest,
    status: LocalAiProviderStatus,
  ): Promise<LanguageModel> {
    return this.provider(request.modelId ?? status.defaultModel, {
      pathToClaudeCodeExecutable: status.executablePath,
      cwd: request.options?.cwd,
    });
  }

  async dispose(): Promise<void> {
    // Claude Agent SDK processes are request-scoped and use AbortSignal.
  }
}
