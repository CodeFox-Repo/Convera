import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import { createOpenAI } from "@ai-sdk/openai";
import { tool as createTool, type ToolSet } from "ai";
import {
  resolveLocalModelId,
  type LocalAiProviderAdapter,
  type LocalAiProviderRun,
} from "../provider-adapter";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../provider-descriptors";
import type { LocalAiProviderStatus } from "../types";

/**
 * Direct OpenAI API access, keyed by OPENAI_API_KEY from the environment
 * (.env is loaded by env-context). Exists primarily so tests and cheap
 * day-to-day use can run on the nano tier instead of subscription quota.
 *
 * Unlike the CLI adapters this is a bare HTTP endpoint: it ships no tools of
 * its own, so the runtime hands it the basic read/write/list set and they are
 * passed straight to `streamText`.
 */
export class OpenAIApiAdapter implements LocalAiProviderAdapter {
  readonly id = "openai-api" as const;
  // No process boundary at all — resolveInSandbox inside the basic tools is the
  // only thing standing between the model and the rest of the disk.
  readonly enforcesSandbox = false;
  readonly providesOwnTools = false;

  private provider?: ReturnType<typeof createOpenAI>;

  private apiKey(): string | undefined {
    return process.env.OPENAI_API_KEY?.trim() || undefined;
  }

  async getStatus(): Promise<LocalAiProviderStatus> {
    const descriptor = LOCAL_AI_PROVIDER_DESCRIPTORS[this.id];
    const key = this.apiKey();
    return {
      ...descriptor,
      available: !!key,
      authenticated: !!key,
      detail: key ? "OpenAI API key configured" : "OPENAI_API_KEY not set",
      checkedAt: new Date().toISOString(),
    };
  }

  async prepareRun(
    request: LocalAIChatRequest,
    status: LocalAiProviderStatus,
    context: Parameters<LocalAiProviderAdapter["prepareRun"]>[2],
  ): Promise<LocalAiProviderRun> {
    const key = this.apiKey();
    if (!key) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    this.provider ??= createOpenAI({ apiKey: key });
    // Conversations persist their model choice, so one started before the
    // catalog changed would keep requesting a model this provider no longer
    // offers. Fall back rather than sending a dead id to the API.
    const requested = resolveLocalModelId(request.modelId, status.defaultModel);
    const modelId = status.models.includes(requested)
      ? requested
      : status.defaultModel;
    const model = this.provider(modelId);
    const exposed =
      context.executionPolicy === "text-only" ? [] : context.tools;
    const tools: ToolSet = Object.fromEntries(
      exposed.map((definition) => [
        definition.name,
        createTool({
          description: definition.description,
          inputSchema: definition.inputValidator,
          execute: async (input) =>
            definition.execute(input as Record<string, unknown>),
        }),
      ]),
    );
    // Stateless HTTP API: no provider-native session to resume, so the
    // request id doubles as the session marker.
    return {
      model,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      // Chat latency is the product here. These models default to medium
      // reasoning, which spends seconds deliberating over "hey" before the
      // first token — a colleague who pauses ten seconds to say hello reads as
      // broken, not thoughtful. "none" is the 5.6 spelling of the old
      // "minimal"; sending "minimal" to a 5.6 model is a hard 400.
      providerOptions: {
        openai: { reasoningEffort: "none", textVerbosity: "low" },
      },
      getNativeSessionId: () => `openai-api:${request.requestId}`,
    };
  }

  async dispose(): Promise<void> {
    this.provider = undefined;
  }
}
