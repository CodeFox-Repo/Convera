import type { DynamicToolUIPart, ToolUIPart } from "ai";

export type ToolMessagePart = ToolUIPart | DynamicToolUIPart;

export function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { input };
    }
  }
  return input === undefined ? {} : { input };
}

export function isToolComplete(part: ToolMessagePart): boolean {
  return (
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied"
  );
}

export function getToolOutput(part: ToolMessagePart): unknown {
  if (part.state === "output-available") return part.output;
  if (part.state === "output-error") return { error: part.errorText };
  if (part.state === "output-denied") {
    return { error: part.approval.reason || "Tool execution was denied." };
  }
  return undefined;
}

export function formatToolOutput(output: unknown): string {
  if (output === undefined) return "Pending result...";
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const outputObject = output as Record<string, unknown>;
    if (outputObject.message) return String(outputObject.message);
    return JSON.stringify(output, null, 2);
  }
  return String(output);
}
