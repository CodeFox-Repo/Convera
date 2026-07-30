import type { Message } from "@/renderer/types/chat";
import { describe, expect, it, vi } from "vitest";
import { createLocalAIUIMessageStream } from "./local-ai-ui-stream";

describe("createLocalAIUIMessageStream", () => {
  it("lets AI SDK assemble text and tool lifecycle parts", async () => {
    const messages: Message[] = [];
    const onError = vi.fn();
    const stream = createLocalAIUIMessageStream({
      messageId: "assistant-1",
      createdAt: new Date(0),
      onMessage: (message) => messages.push(message),
      onError,
    });

    stream.push({ type: "start", messageId: "assistant-1" });
    stream.push({ type: "start-step" });
    stream.push({ type: "text-start", id: "text-1" });
    stream.push({ type: "text-delta", id: "text-1", delta: "Working" });
    stream.push({ type: "text-end", id: "text-1" });
    stream.push({
      type: "tool-input-start",
      toolCallId: "tool-1",
      toolName: "builtin:execute_command",
      dynamic: true,
    });
    stream.push({
      type: "tool-input-delta",
      toolCallId: "tool-1",
      inputTextDelta: '{"command":"pwd"}',
    });
    stream.push({
      type: "tool-input-available",
      toolCallId: "tool-1",
      toolName: "builtin:execute_command",
      input: { command: "pwd" },
      dynamic: true,
    });
    stream.push({
      type: "tool-output-available",
      toolCallId: "tool-1",
      output: { stdout: "/workspace" },
      dynamic: true,
    });
    stream.push({ type: "finish-step" });
    stream.push({ type: "finish", finishReason: "stop" });
    stream.close();
    await stream.done;

    expect(onError).not.toHaveBeenCalled();
    expect(messages.at(-1)).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      content: "Working",
      parts: [
        { type: "step-start" },
        { type: "text", text: "Working", state: "done" },
        {
          type: "dynamic-tool",
          toolCallId: "tool-1",
          toolName: "builtin:execute_command",
          state: "output-available",
          input: { command: "pwd" },
          output: { stdout: "/workspace" },
        },
      ],
    });
  });
});
