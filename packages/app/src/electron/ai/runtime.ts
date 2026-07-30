import type {
  LocalAIChatRequest,
  LocalAIFinishReason,
  LocalAIProviderAvailability,
  LocalAIProviderStatus,
  LocalAIRuntimeService,
  LocalAISerializableError,
  LocalAIStreamEvent,
  LocalAIUsage,
} from "@/shared/types/local-ai";
import { streamText, type LanguageModel, type ModelMessage } from "ai";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "./provider-descriptors";
import type { LocalAiProviderAdapter } from "./provider-adapter";
import { ClaudeCodeAdapter } from "./providers/claude-code";
import { CodexCliAdapter } from "./providers/codex-cli";
import {
  LOCAL_AI_PROVIDER_IDS,
  type LocalAiProviderId,
  type LocalAiProviderStatus as ProbeStatus,
} from "./types";

type RuntimeStreamPart = Record<string, unknown> & { type: string };

interface RuntimeStreamResult {
  fullStream: AsyncIterable<RuntimeStreamPart>;
}

interface RuntimeStreamOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  abortSignal: AbortSignal;
  maxOutputTokens?: number;
}

export type RuntimeStreamInvoker = (
  options: RuntimeStreamOptions,
) => RuntimeStreamResult;

const defaultStreamInvoker: RuntimeStreamInvoker = (options) =>
  streamText(options) as unknown as RuntimeStreamResult;

function isProviderId(providerId: string): providerId is LocalAiProviderId {
  return LOCAL_AI_PROVIDER_IDS.includes(providerId as LocalAiProviderId);
}

function availabilityFor(status: ProbeStatus): LocalAIProviderAvailability {
  if (!status.available) {
    return "missing";
  }
  if (!status.authenticated) {
    return "unauthenticated";
  }
  return "available";
}

function publicStatus(status: ProbeStatus): LocalAIProviderStatus {
  const detailParts = [status.detail];
  if (status.version) {
    detailParts.push(status.version);
  }

  return {
    id: status.id,
    name: status.label,
    kind: status.id,
    availability: availabilityFor(status),
    detail: detailParts.filter(Boolean).join(" · ") || undefined,
    models: status.models.map((model) => ({ id: model, name: model })),
  };
}

function missingProviderStatus(providerId: string): LocalAIProviderStatus {
  return {
    id: providerId,
    name: providerId,
    kind: "openai-compatible",
    availability: "unavailable",
    detail: `Unknown local AI provider: ${providerId}`,
  };
}

export function serializeLocalAiError(
  error: unknown,
  code?: string,
): LocalAISerializableError {
  if (error instanceof Error) {
    const errorWithCode = error as Error & { code?: unknown };
    return {
      name: error.name,
      message: error.message,
      code:
        code ??
        (typeof errorWithCode.code === "string"
          ? errorWithCode.code
          : undefined),
      stack: error.stack,
    };
  }

  return {
    name: "Error",
    message: typeof error === "string" ? error : JSON.stringify(error),
    code,
  };
}

function toMessages(request: LocalAIChatRequest): ModelMessage[] {
  const agentPrompt = request.agent?.systemPrompt?.trim();
  const messages: ModelMessage[] = request.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  if (agentPrompt) {
    messages.unshift({ role: "system", content: agentPrompt });
  }

  return messages;
}

function finishReason(reason: unknown): LocalAIFinishReason {
  switch (reason) {
    case "stop":
    case "length":
    case "content-filter":
    case "tool-calls":
    case "error":
      return reason;
    default:
      return "unknown";
  }
}

function usageFrom(value: unknown): LocalAIUsage | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const usage = value as Record<string, unknown>;
  const inputTokens =
    typeof usage.inputTokens === "number" ? usage.inputTokens : undefined;
  const outputTokens =
    typeof usage.outputTokens === "number" ? usage.outputTokens : undefined;
  const totalTokens =
    typeof usage.totalTokens === "number" ? usage.totalTokens : undefined;

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined
  ) {
    return undefined;
  }

  return { inputTokens, outputTokens, totalTokens };
}

function stringField(
  part: RuntimeStreamPart,
  ...fields: string[]
): string | undefined {
  for (const field of fields) {
    const value = part[field];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

export class LocalAiRuntime implements LocalAIRuntimeService {
  private readonly adapters = new Map<
    LocalAiProviderId,
    LocalAiProviderAdapter
  >();
  private readonly activeRequests = new Map<string, AbortController>();
  private readonly streamInvoker: RuntimeStreamInvoker;
  private readonly workingDirectory: string;

  constructor(
    options: {
      adapters?: LocalAiProviderAdapter[];
      streamInvoker?: RuntimeStreamInvoker;
      workingDirectory?: string;
    } = {},
  ) {
    const adapters = options.adapters ?? [
      new ClaudeCodeAdapter(),
      new CodexCliAdapter(),
    ];
    this.streamInvoker = options.streamInvoker ?? defaultStreamInvoker;
    this.workingDirectory = options.workingDirectory ?? process.cwd();

    for (const adapter of adapters) {
      this.adapters.set(adapter.id, adapter);
    }
  }

  async listProviders(): Promise<LocalAIProviderStatus[]> {
    return Promise.all(
      LOCAL_AI_PROVIDER_IDS.map((providerId) =>
        this.getProviderStatus(providerId),
      ),
    );
  }

  async getProviderStatus(providerId: string): Promise<LocalAIProviderStatus> {
    if (!isProviderId(providerId)) {
      return missingProviderStatus(providerId);
    }

    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      const descriptor = LOCAL_AI_PROVIDER_DESCRIPTORS[providerId];
      return {
        id: providerId,
        name: descriptor.label,
        kind: providerId,
        availability: "unavailable",
        detail: `${descriptor.label} adapter is not configured.`,
        models: descriptor.models.map((model) => ({
          id: model,
          name: model,
        })),
      };
    }

    try {
      return publicStatus(await adapter.getStatus());
    } catch (error) {
      return {
        id: providerId,
        name: LOCAL_AI_PROVIDER_DESCRIPTORS[providerId].label,
        kind: providerId,
        availability: "error",
        detail: serializeLocalAiError(error).message,
      };
    }
  }

  async startChat(
    request: LocalAIChatRequest,
    emit: (event: LocalAIStreamEvent) => void,
  ): Promise<void> {
    if (this.activeRequests.has(request.requestId)) {
      this.emitFailure(
        request.requestId,
        emit,
        new Error(`Request is already active: ${request.requestId}`),
        "DUPLICATE_REQUEST",
      );
      return;
    }

    if (!isProviderId(request.providerId)) {
      this.emitFailure(
        request.requestId,
        emit,
        new Error(`Unknown local AI provider: ${request.providerId}`),
        "UNKNOWN_PROVIDER",
      );
      return;
    }

    if (request.messages.length === 0) {
      this.emitFailure(
        request.requestId,
        emit,
        new Error("At least one chat message is required."),
        "EMPTY_MESSAGES",
      );
      return;
    }

    const adapter = this.adapters.get(request.providerId);
    if (!adapter) {
      this.emitFailure(
        request.requestId,
        emit,
        new Error(`Provider adapter is unavailable: ${request.providerId}`),
        "PROVIDER_UNAVAILABLE",
      );
      return;
    }

    const controller = new AbortController();
    this.activeRequests.set(request.requestId, controller);

    try {
      const probeStatus = await adapter.getStatus();
      if (!probeStatus.available || !probeStatus.authenticated) {
        this.emitFailure(
          request.requestId,
          emit,
          new Error(
            probeStatus.detail ??
              `${probeStatus.label} is unavailable or unauthenticated.`,
          ),
          probeStatus.available
            ? "PROVIDER_UNAUTHENTICATED"
            : "PROVIDER_MISSING",
        );
        return;
      }

      // Renderer input must not expand filesystem scope. Main chooses a single
      // trusted working directory when constructing the runtime.
      const trustedRequest: LocalAIChatRequest = {
        ...request,
        options: {
          ...request.options,
          cwd: this.workingDirectory,
        },
      };
      const model = await adapter.createModel(trustedRequest, probeStatus);
      const result = this.streamInvoker({
        model,
        messages: toMessages(request),
        abortSignal: controller.signal,
        maxOutputTokens: request.options?.maxOutputTokens,
      });
      await this.forwardStream(request.requestId, result, controller, emit);
    } catch (error) {
      if (controller.signal.aborted) {
        emit({
          type: "finish",
          requestId: request.requestId,
          finishReason: "aborted",
        });
      } else {
        this.emitFailure(request.requestId, emit, error);
      }
    } finally {
      this.activeRequests.delete(request.requestId);
    }
  }

  abort(requestId: string): boolean {
    const controller = this.activeRequests.get(requestId);
    if (!controller) {
      return false;
    }

    controller.abort();
    return true;
  }

  async dispose(): Promise<void> {
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();

    await Promise.all(
      [...this.adapters.values()].map((adapter) => adapter.dispose()),
    );
  }

  private async forwardStream(
    requestId: string,
    result: RuntimeStreamResult,
    controller: AbortController,
    emit: (event: LocalAIStreamEvent) => void,
  ): Promise<void> {
    const toolNames = new Map<string, string>();
    const toolInputs = new Map<string, string>();
    let terminalEventEmitted = false;

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta": {
          const text = stringField(part, "text");
          if (text) {
            emit({ type: "delta", requestId, text });
          }
          break;
        }
        case "tool-input-start": {
          const toolCallId = stringField(part, "id") ?? "unknown";
          const name = stringField(part, "toolName") ?? "unknown";
          toolNames.set(toolCallId, name);
          toolInputs.set(toolCallId, "");
          emit({
            type: "tool",
            requestId,
            toolCallId,
            name,
            state: "input-streaming",
          });
          break;
        }
        case "tool-input-delta": {
          const toolCallId = stringField(part, "id") ?? "unknown";
          const delta = stringField(part, "delta") ?? "";
          const input = `${toolInputs.get(toolCallId) ?? ""}${delta}`;
          toolInputs.set(toolCallId, input);
          emit({
            type: "tool",
            requestId,
            toolCallId,
            name: toolNames.get(toolCallId) ?? "unknown",
            state: "input-streaming",
            input,
          });
          break;
        }
        case "tool-call": {
          const toolCallId = stringField(part, "toolCallId", "id") ?? "unknown";
          const name =
            stringField(part, "toolName") ??
            toolNames.get(toolCallId) ??
            "unknown";
          emit({
            type: "tool",
            requestId,
            toolCallId,
            name,
            state: "input-available",
            input: part.input,
          });
          break;
        }
        case "tool-result": {
          const toolCallId = stringField(part, "toolCallId", "id") ?? "unknown";
          emit({
            type: "tool",
            requestId,
            toolCallId,
            name:
              stringField(part, "toolName") ??
              toolNames.get(toolCallId) ??
              "unknown",
            state: "output-available",
            output: part.output,
          });
          break;
        }
        case "tool-error": {
          const toolCallId = stringField(part, "toolCallId", "id") ?? "unknown";
          emit({
            type: "tool",
            requestId,
            toolCallId,
            name:
              stringField(part, "toolName") ??
              toolNames.get(toolCallId) ??
              "unknown",
            state: "output-error",
            error: serializeLocalAiError(part.error),
          });
          break;
        }
        case "abort":
          emit({ type: "finish", requestId, finishReason: "aborted" });
          terminalEventEmitted = true;
          break;
        case "error":
          emit({
            type: "error",
            requestId,
            error: serializeLocalAiError(part.error),
          });
          emit({ type: "finish", requestId, finishReason: "error" });
          terminalEventEmitted = true;
          break;
        case "finish":
          emit({
            type: "finish",
            requestId,
            finishReason: controller.signal.aborted
              ? "aborted"
              : finishReason(part.finishReason),
            usage: usageFrom(part.totalUsage),
          });
          terminalEventEmitted = true;
          break;
      }

      if (terminalEventEmitted) {
        break;
      }
    }

    if (!terminalEventEmitted) {
      emit({
        type: "finish",
        requestId,
        finishReason: controller.signal.aborted ? "aborted" : "unknown",
      });
    }
  }

  private emitFailure(
    requestId: string,
    emit: (event: LocalAIStreamEvent) => void,
    error: unknown,
    code?: string,
  ): void {
    emit({
      type: "error",
      requestId,
      error: serializeLocalAiError(error, code),
    });
    emit({ type: "finish", requestId, finishReason: "error" });
  }
}
