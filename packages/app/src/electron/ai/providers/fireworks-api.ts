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
 * Fireworks-hosted open models, keyed by FIREWORKS_API_KEY. Same shape as the
 * OpenAI adapter — a bare HTTP endpoint carrying no tools of its own, so the
 * runtime hands it the basic read/write/list set.
 */
export class FireworksApiAdapter implements LocalAiProviderAdapter {
  readonly id = "fireworks-api" as const;
  // No process boundary: resolveInSandbox inside the basic tools is the only
  // thing between the model and the rest of the disk.
  readonly enforcesSandbox = false;
  readonly providesOwnTools = false;

  private provider?: ReturnType<typeof createOpenAI>;

  private apiKey(): string | undefined {
    return process.env.FIREWORKS_API_KEY?.trim() || undefined;
  }

  async getStatus(): Promise<LocalAiProviderStatus> {
    const descriptor = LOCAL_AI_PROVIDER_DESCRIPTORS[this.id];
    const key = this.apiKey();
    return {
      ...descriptor,
      available: !!key,
      authenticated: !!key,
      detail: key
        ? "Fireworks API key configured"
        : "FIREWORKS_API_KEY not set",
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
      throw new Error("FIREWORKS_API_KEY is not configured");
    }
    this.provider ??= createOpenAI({
      apiKey: key,
      baseURL: "https://api.fireworks.ai/inference/v1",
    });
    // Conversations persist their model choice, so one started before the
    // catalog changed would keep requesting a model this provider no longer
    // offers. Fall back rather than sending a dead id to the API.
    const requested = resolveLocalModelId(request.modelId, status.defaultModel);
    const modelId = status.models.includes(requested)
      ? requested
      : status.defaultModel;
    // The callable provider targets the Responses API, which Fireworks
    // implements at this baseURL — and which is what surfaces this model's
    // reasoning rather than folding it into the answer text.
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
    // Stateless as far as we are concerned: this runtime owns the transcript
    // and rebases it per turn, so there is no provider-native session to
    // resume and the request id doubles as the session marker.
    //
    // `store: false` — the Responses API keeps conversations server-side by
    // default under a different retention policy than chat completions, and a
    // workspace transcript is not ours to leave there.
    //
    // `max` reasoning: deciding whether to speak in a room, and then reaching
    // for the right tool to do it, is the judgement this whole design rests
    // on, and it is exactly what a turn skimps on first — at `none` the model
    // writes its answer straight into turn output that nobody can read.
    // Fireworks honours the knob (verified: `none` returns no reasoning at
    // all), and this model is cheap enough not to ration it.
    return {
      model,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      providerOptions: { openai: { store: false, reasoningEffort: "max" } },
      getNativeSessionId: () => `fireworks-api:${request.requestId}`,
    };
  }

  async dispose(): Promise<void> {
    this.provider = undefined;
  }
}
