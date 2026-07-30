import type { DynamicToolUIPart } from "ai";
import { describe, expect, it } from "vitest";
import {
  formatToolOutput,
  getToolOutput,
  isToolComplete,
  normalizeToolInput,
} from "./tool-part";

describe("AI SDK tool part rendering", () => {
  it("reads input and output directly from a completed dynamic tool part", () => {
    const part: DynamicToolUIPart = {
      type: "dynamic-tool",
      toolName: "exec",
      toolCallId: "tool-1",
      state: "output-available",
      input: '{"command":"pwd"}',
      output: { stdout: "/workspace", exitCode: 0 },
    };

    expect(normalizeToolInput(part.input)).toEqual({ command: "pwd" });
    expect(isToolComplete(part)).toBe(true);
    expect(formatToolOutput(getToolOutput(part))).toContain('"exitCode": 0');
  });

  it("uses native AI SDK error and denial states", () => {
    const errorPart: DynamicToolUIPart = {
      type: "dynamic-tool",
      toolName: "exec",
      toolCallId: "tool-2",
      state: "output-error",
      input: { command: "false" },
      errorText: "Command failed",
    };
    const deniedPart: DynamicToolUIPart = {
      type: "dynamic-tool",
      toolName: "exec",
      toolCallId: "tool-3",
      state: "output-denied",
      input: { command: "rm file" },
      approval: {
        id: "approval-1",
        approved: false,
        reason: "Denied by user",
      },
    };

    expect(getToolOutput(errorPart)).toEqual({ error: "Command failed" });
    expect(getToolOutput(deniedPart)).toEqual({ error: "Denied by user" });
  });
});
