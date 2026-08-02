import type {
  LocalAIFinishReason,
  LocalAIUsage,
} from "@/shared/types/local-ai";
import { WORKSPACE_SEND_MESSAGE_TOOL } from "@/shared/types/workspace-perception";
import type {
  PiAgentCoreModule,
  PiAgentEvent,
  PiAgentTool,
  PiAiCompatModule,
  PiAssistantMessage,
  PiImageContent,
  PiMessage,
  PiModel,
  PiStreamFn,
  PiTextContent,
} from "./pi-agent-types";
import type { FinishReason, ModelMessage, UIMessageChunk } from "ai";
import type { AgentTool } from "./agent-tools";
import type { LocalAiPiProviderRun } from "./provider-adapter";
import { toMcpToolResult } from "./tool-result";

const PI_AGENT_CORE_MODULE = "@earendil-works/pi-agent-core";
const PI_AI_COMPAT_MODULE = "@earendil-works/pi-ai/compat";
const piAgentCore = import(PI_AGENT_CORE_MODULE) as Promise<PiAgentCoreModule>;
const piAi = import(PI_AI_COMPAT_MODULE) as Promise<PiAiCompatModule>;

const MAX_AGENT_TURNS = 50;

class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ done: false, value });
      return;
    }
    this.values.push(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value !== undefined) {
          return Promise.resolve({ done: false, value });
        }
        if (this.closed) {
          return Promise.resolve({ done: true, value: undefined });
        }
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content))
    return JSON.stringify(content) ?? String(content);
  return content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const record = part as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") {
        return [record.text];
      }
      return [];
    })
    .join("\n");
}

function emptyUsage(): PiAssistantMessage["usage"] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function toPiPrompt(
  messages: ModelMessage[],
  model: PiModel,
): { systemPrompt: string; messages: PiMessage[] } {
  const system: string[] = [];
  const prompt: PiMessage[] = [];
  let timestamp = Date.now();

  for (const message of messages) {
    const content = textOfContent(message.content);
    if (message.role === "system") {
      if (content) system.push(content);
      continue;
    }
    if (message.role === "user") {
      prompt.push({ role: "user", content, timestamp: timestamp++ });
      continue;
    }
    if (message.role === "assistant") {
      prompt.push({
        role: "assistant",
        content: [{ type: "text", text: content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: emptyUsage(),
        stopReason: "stop",
        timestamp: timestamp++,
      });
    }
  }

  return { systemPrompt: system.join("\n\n"), messages: prompt };
}

function toPiToolContent(
  output: unknown,
): Array<PiTextContent | PiImageContent> {
  const result = toMcpToolResult(output);
  const content = result.content.flatMap<PiTextContent | PiImageContent>(
    (part) => {
      if (part.type === "text") {
        return [{ type: "text", text: part.text }];
      }
      if (part.type === "image") {
        return [{ type: "image", data: part.data, mimeType: part.mimeType }];
      }
      return [{ type: "text", text: JSON.stringify(part) }];
    },
  );
  if (result.isError) {
    throw new Error(
      content
        .filter((part): part is PiTextContent => part.type === "text")
        .map((part) => part.text)
        .join("\n") || "Tool execution failed",
    );
  }
  return content.length > 0 ? content : [{ type: "text", text: "" }];
}

function isSpeechTool(name: string): boolean {
  return (
    name === WORKSPACE_SEND_MESSAGE_TOOL ||
    name.endsWith(`__${WORKSPACE_SEND_MESSAGE_TOOL}`) ||
    name.endsWith(`.${WORKSPACE_SEND_MESSAGE_TOOL}`)
  );
}

function toPiTools(tools: AgentTool[]): PiAgentTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    label: tool.qualifiedName,
    description: tool.description,
    parameters: tool.inputSchema as PiAgentTool["parameters"],
    execute: async (_toolCallId, params, signal) => {
      signal?.throwIfAborted();
      const output = await tool.execute(params as Record<string, unknown>);
      return {
        content: toPiToolContent(output),
        details: output,
        terminate: isSpeechTool(tool.name),
      };
    },
  }));
}

function finishReason(
  reason: PiAssistantMessage["stopReason"],
): LocalAIFinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "toolUse":
      return "tool-calls";
    case "error":
    case "aborted":
      return "error";
    default:
      return "unknown";
  }
}

function uiFinishReason(reason: LocalAIFinishReason): FinishReason {
  if (reason === "aborted") return "error";
  if (reason === "unknown") return "other";
  return reason;
}

function usageOf(messages: PiMessage[]): LocalAIUsage {
  const assistants = messages.filter(
    (message): message is PiAssistantMessage => message.role === "assistant",
  );
  return assistants.reduce<LocalAIUsage>(
    (usage, message) => ({
      inputTokens: (usage.inputTokens ?? 0) + message.usage.input,
      outputTokens: (usage.outputTokens ?? 0) + message.usage.output,
      totalTokens: (usage.totalTokens ?? 0) + message.usage.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
}

function resultOutput(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const record = result as Record<string, unknown>;
  if (record.details !== undefined) return record.details;
  return record.content ?? result;
}

function resultError(result: unknown): string {
  const output = resultOutput(result);
  if (typeof output === "string") return output;
  return JSON.stringify(output) ?? "Tool execution failed";
}

export interface PiAgentRuntimeStreamOptions {
  requestId: string;
  run: LocalAiPiProviderRun;
  messages: ModelMessage[];
  tools: AgentTool[];
  abortSignal: AbortSignal;
  maxOutputTokens?: number;
  temperature?: number;
  streamFn?: PiStreamFn;
}

export type PiAgentRuntimeStreamFactory = typeof createPiAgentRuntimeStream;

export function createPiAgentRuntimeStream(
  options: PiAgentRuntimeStreamOptions,
): {
  toUIMessageStream(): AsyncIterable<UIMessageChunk>;
  finishReason: Promise<LocalAIFinishReason>;
  usage: Promise<LocalAIUsage>;
} {
  const queue = new AsyncQueue<UIMessageChunk>();
  const completedReason = deferred<LocalAIFinishReason>();
  const completedUsage = deferred<LocalAIUsage>();
  const prompt = toPiPrompt(options.messages, options.run.model);
  let turn = 0;

  queue.push({ type: "start", messageId: `pi-${options.requestId}` });

  void (async () => {
    try {
      const [{ runAgentLoop }, pi] = await Promise.all([piAgentCore, piAi]);
      const streamFn = options.streamFn ?? pi.streamSimple;
      const messages = await runAgentLoop(
        prompt.messages,
        {
          systemPrompt: prompt.systemPrompt,
          messages: [],
          tools: toPiTools(options.tools),
        },
        {
          model: options.run.model,
          convertToLlm: (items) => items,
          apiKey: options.run.apiKey,
          fetch: options.run.fetch,
          reasoning: options.run.reasoning,
          maxTokens: options.maxOutputTokens,
          temperature: options.temperature,
          sessionId: options.run.getNativeSessionId(undefined),
          onPayload: options.run.onPayload,
          toolExecution: "parallel",
          shouldStopAfterTurn: ({ toolResults }) => {
            turn += 1;
            return (
              turn >= MAX_AGENT_TURNS ||
              toolResults.some((result) => isSpeechTool(result.toolName))
            );
          },
        },
        async (event) => {
          emitPiEvent(queue, options.requestId, event, turn);
        },
        options.abortSignal,
        streamFn,
      );
      const lastAssistant = messages.findLast(
        (message): message is PiAssistantMessage =>
          message.role === "assistant",
      );
      const reason = lastAssistant
        ? finishReason(lastAssistant.stopReason)
        : "unknown";
      if (lastAssistant?.errorMessage) {
        queue.push({ type: "error", errorText: lastAssistant.errorMessage });
      }
      queue.push({ type: "finish", finishReason: uiFinishReason(reason) });
      completedReason.resolve(reason);
      completedUsage.resolve(usageOf(messages));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      queue.push({ type: "error", errorText: message });
      queue.push({ type: "finish", finishReason: "error" });
      completedReason.resolve("error");
      completedUsage.resolve({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    } finally {
      queue.close();
    }
  })();

  return {
    toUIMessageStream: () => queue,
    finishReason: completedReason.promise,
    usage: completedUsage.promise,
  };
}

function emitPiEvent(
  queue: AsyncQueue<UIMessageChunk>,
  requestId: string,
  event: PiAgentEvent,
  turn: number,
): void {
  switch (event.type) {
    case "turn_start":
      queue.push({ type: "start-step" });
      return;
    case "turn_end":
      queue.push({ type: "finish-step" });
      return;
    case "message_update": {
      const update = event.assistantMessageEvent;
      const id = `pi-${requestId}-${turn}-${"contentIndex" in update ? update.contentIndex : 0}`;
      switch (update.type) {
        case "text_start":
          queue.push({ type: "text-start", id });
          return;
        case "text_delta":
          queue.push({ type: "text-delta", id, delta: update.delta });
          return;
        case "text_end":
          queue.push({ type: "text-end", id });
          return;
        case "thinking_start":
          queue.push({ type: "reasoning-start", id });
          return;
        case "thinking_delta":
          queue.push({ type: "reasoning-delta", id, delta: update.delta });
          return;
        case "thinking_end":
          queue.push({ type: "reasoning-end", id });
          return;
        default:
          return;
      }
    }
    case "tool_execution_start":
      queue.push({
        type: "tool-input-available",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.args,
        dynamic: true,
      });
      return;
    case "tool_execution_end":
      if (event.isError) {
        queue.push({
          type: "tool-output-error",
          toolCallId: event.toolCallId,
          errorText: resultError(event.result),
          dynamic: true,
        });
      } else {
        queue.push({
          type: "tool-output-available",
          toolCallId: event.toolCallId,
          output: resultOutput(event.result),
          dynamic: true,
        });
      }
      return;
    default:
      return;
  }
}
