import { describe, expect, it } from "vitest";
import { isMcpToolResult, toMcpToolResult } from "./tool-result";

describe("tool result conversion", () => {
  it("preserves MCP image content", () => {
    const result = {
      content: [
        { type: "text" as const, text: "screen" },
        { type: "image" as const, data: "cG5n", mimeType: "image/png" },
      ],
    };

    expect(isMcpToolResult(result)).toBe(true);
    expect(toMcpToolResult(result)).toBe(result);
  });

  it("converts ordinary tool output to MCP text content", () => {
    expect(toMcpToolResult({ success: true })).toEqual({
      content: [{ type: "text", text: '{"success":true}' }],
    });
  });
});
