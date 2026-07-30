import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isMcpToolResult(value: unknown): value is CallToolResult {
  return (
    isRecord(value) &&
    Array.isArray(value.content) &&
    value.content.every(
      (content) => isRecord(content) && typeof content.type === "string",
    )
  );
}

export function toMcpToolResult(output: unknown): CallToolResult {
  if (isMcpToolResult(output)) {
    return output;
  }

  return {
    content: [
      {
        type: "text",
        text:
          typeof output === "string"
            ? output
            : (JSON.stringify(output) ?? String(output)),
      },
    ],
  };
}
