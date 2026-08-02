import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import {
  resolveLocalModelId,
  type LocalAiProviderAdapter,
  type LocalAiProviderRun,
} from "../provider-adapter";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "../provider-descriptors";
import type { PiAiCompatModule } from "../pi-agent-types";
import type { LocalAiProviderStatus } from "../types";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const PI_AI_COMPAT_MODULE = "@earendil-works/pi-ai/compat";
const piAi = import(PI_AI_COMPAT_MODULE) as Promise<PiAiCompatModule>;

function withLowTextVerbosity(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  const text =
    record.text &&
    typeof record.text === "object" &&
    !Array.isArray(record.text)
      ? (record.text as Record<string, unknown>)
      : {};
  return { ...record, text: { ...text, verbosity: "low" } };
}

/**
 * Direct OpenAI API access, keyed by OPENAI_API_KEY from the environment
 * (.env is loaded by env-context). Exists primarily so tests and cheap
 * day-to-day use can run on the nano tier instead of subscription quota.
 *
 * Unlike the CLI adapters this is a bare HTTP endpoint: it ships no tools of
 * its own, so the runtime hands Convera's basic read/write/list set to Pi's
 * agent loop. The original Convera tool executors remain the security boundary.
 */
export class OpenAIApiAdapter implements LocalAiProviderAdapter {
  readonly id = "openai-api" as const;
  // No process boundary at all — resolveInSandbox inside the basic tools is the
  // only thing standing between the model and the rest of the disk.
  readonly enforcesSandbox = false;
  readonly resumesNativeSession = false;
  readonly providesOwnTools = false;
  private proxyAgent?: ProxyAgent;
  private proxyFetch?: typeof globalThis.fetch;

  private apiKey(): string | undefined {
    return process.env.OPENAI_API_KEY?.trim() || undefined;
  }

  private fetch(): typeof globalThis.fetch | undefined {
    const proxyUrl = (
      process.env.HTTPS_PROXY ??
      process.env.https_proxy ??
      process.env.ALL_PROXY ??
      process.env.all_proxy ??
      process.env.HTTP_PROXY ??
      process.env.http_proxy
    )?.trim();
    if (!proxyUrl) return undefined;
    if (!this.proxyFetch) {
      this.proxyAgent = new ProxyAgent(proxyUrl);
      this.proxyFetch = async (input, init) =>
        (await undiciFetch(
          input as Parameters<typeof undiciFetch>[0],
          {
            ...init,
            dispatcher: this.proxyAgent,
          } as Parameters<typeof undiciFetch>[1],
        )) as unknown as Response;
    }
    return this.proxyFetch;
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
  ): Promise<LocalAiProviderRun> {
    const key = this.apiKey();
    if (!key) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    // Conversations persist their model choice, so one started before the
    // catalog changed would keep requesting a model this provider no longer
    // offers. Fall back rather than sending a dead id to the API.
    const requested = resolveLocalModelId(request.modelId, status.defaultModel);
    const modelId = status.models.includes(requested)
      ? requested
      : status.defaultModel;
    const model = (await piAi)
      .getModels("openai")
      .find((candidate) => candidate.id === modelId);
    if (!model) {
      throw new Error(`OpenAI model is unavailable in Pi: ${modelId}`);
    }
    // Stateless HTTP API: the runtime replays the bounded transcript. Pi still
    // receives a stable conversation marker for request/cache affinity, but it
    // does not treat that marker as provider-owned conversation history.
    return {
      executionEngine: "pi-agent-core",
      model,
      apiKey: key,
      fetch: this.fetch(),
      reasoning: "medium",
      onPayload: withLowTextVerbosity,
      getNativeSessionId: () => `openai-api:${request.conversationId}`,
    };
  }

  async dispose(): Promise<void> {
    await this.proxyAgent?.close();
    this.proxyAgent = undefined;
    this.proxyFetch = undefined;
  }
}
