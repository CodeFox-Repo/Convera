import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AgentTool } from "./agent-tools";
import { createPiAgentRuntimeStream } from "./pi-agent-driver";
import type {
  PiAgentContext,
  PiAssistantMessage,
  PiAssistantMessageEvent,
  PiAssistantMessageEventStream,
  PiModel,
  PiStreamFn,
  PiStreamOptions,
} from "./pi-agent-types";
import type { LocalAiPiProviderRun } from "./provider-adapter";

const model: PiModel = {
  id: "gpt-test",
  name: "GPT Test",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "https://example.test/v1",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 10_000,
};

function usage(input: number, output: number) {
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function assistant(
  content: PiAssistantMessage["content"],
  stopReason: PiAssistantMessage["stopReason"],
  input = 1,
  output = 1,
): PiAssistantMessage {
  return {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: usage(input, output),
    stopReason,
    timestamp: Date.now(),
  };
}

function eventStream(
  events: PiAssistantMessageEvent[],
  result: PiAssistantMessage,
): PiAssistantMessageEventStream {
  return {
    async *[Symbol.asyncIterator]() {
      yield* events;
    },
    async result() {
      return result;
    },
  };
}

function run(): LocalAiPiProviderRun {
  return {
    executionEngine: "pi-agent-core",
    model,
    apiKey: "test-key",
    reasoning: "medium",
    getNativeSessionId: () => "openai-api:request-1",
  };
}

function tool(name: string, execute: AgentTool["execute"]): AgentTool {
  return {
    name,
    qualifiedName: `workspace:${name}`,
    description: `Run ${name}`,
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
    inputShape: { path: z.string() },
    inputValidator: z.object({ path: z.string() }),
    execute,
  };
}

async function collect(stream: ReturnType<typeof createPiAgentRuntimeStream>) {
  const chunks = [];
  for await (const chunk of stream.toUIMessageStream()) chunks.push(chunk);
  return chunks;
}

describe("Pi agent driver", () => {
  it("runs the Pi tool loop and translates lifecycle events", async () => {
    const execute = vi.fn(async () => ({ contents: "hello" }));
    const contexts: PiAgentContext[] = [];
    const streamOptions: Array<PiStreamOptions | undefined> = [];
    let call = 0;
    const streamFn: PiStreamFn = (_model, context, options) => {
      contexts.push({
        systemPrompt: context.systemPrompt,
        messages: structuredClone(context.messages),
        tools: context.tools,
      });
      streamOptions.push(options);
      call += 1;
      if (call === 1) {
        const pending = assistant([], "pending", 0, 0);
        const final = assistant(
          [
            {
              type: "toolCall",
              id: "tool-1",
              name: "read_file",
              arguments: { path: "README.md" },
            },
          ],
          "toolUse",
          3,
          1,
        );
        return eventStream(
          [
            { type: "start", partial: pending },
            { type: "toolcall_start", contentIndex: 0, partial: pending },
            { type: "toolcall_end", contentIndex: 0, partial: final },
            { type: "done", message: final },
          ],
          final,
        );
      }
      const pending = assistant([], "pending", 0, 0);
      const partial = assistant([{ type: "text", text: "done" }], "pending");
      const final = assistant([{ type: "text", text: "done" }], "stop", 5, 2);
      return eventStream(
        [
          { type: "start", partial: pending },
          { type: "text_start", contentIndex: 0, partial: pending },
          { type: "text_delta", contentIndex: 0, delta: "done", partial },
          { type: "text_end", contentIndex: 0, content: "done", partial },
          { type: "done", message: final },
        ],
        final,
      );
    };
    const stream = createPiAgentRuntimeStream({
      requestId: "request-1",
      run: run(),
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Read the file." },
      ],
      tools: [tool("read_file", execute)],
      abortSignal: new AbortController().signal,
      maxOutputTokens: 2048,
      temperature: 0.2,
      streamFn,
    });

    const chunks = await collect(stream);

    expect(call).toBe(2);
    expect(execute).toHaveBeenCalledWith({ path: "README.md" });
    expect(contexts[0]?.systemPrompt).toBe("Be concise.");
    expect(contexts[1]?.messages.at(-1)).toMatchObject({
      role: "toolResult",
      toolName: "read_file",
      details: { contents: "hello" },
    });
    expect(streamOptions[0]).toMatchObject({
      apiKey: "test-key",
      reasoning: "medium",
      maxTokens: 2048,
      temperature: 0.2,
    });
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-input-available",
          toolCallId: "tool-1",
          toolName: "read_file",
        }),
        expect.objectContaining({
          type: "tool-output-available",
          toolCallId: "tool-1",
          output: { contents: "hello" },
        }),
        expect.objectContaining({ type: "text-delta", delta: "done" }),
        { type: "finish", finishReason: "stop" },
      ]),
    );
    await expect(stream.finishReason).resolves.toBe("stop");
    await expect(stream.usage).resolves.toEqual({
      inputTokens: 8,
      outputTokens: 3,
      totalTokens: 11,
    });
  });

  it("stops after the workspace speech tool", async () => {
    const execute = vi.fn(async () => ({ delivered: true }));
    let calls = 0;
    const streamFn: PiStreamFn = () => {
      calls += 1;
      const pending = assistant([], "pending", 0, 0);
      const final = assistant(
        [
          {
            type: "toolCall",
            id: "tool-speak",
            name: "send_message",
            arguments: { path: "room" },
          },
        ],
        "toolUse",
      );
      return eventStream(
        [
          { type: "start", partial: pending },
          { type: "toolcall_start", contentIndex: 0, partial: pending },
          { type: "toolcall_end", contentIndex: 0, partial: final },
          { type: "done", message: final },
        ],
        final,
      );
    };
    const stream = createPiAgentRuntimeStream({
      requestId: "request-2",
      run: run(),
      messages: [{ role: "user", content: "Answer in the room." }],
      tools: [tool("send_message", execute)],
      abortSignal: new AbortController().signal,
      streamFn,
    });

    const chunks = await collect(stream);

    expect(calls).toBe(1);
    expect(execute).toHaveBeenCalledOnce();
    expect(chunks.at(-1)).toEqual({
      type: "finish",
      finishReason: "tool-calls",
    });
    await expect(stream.finishReason).resolves.toBe("tool-calls");
  });
});
