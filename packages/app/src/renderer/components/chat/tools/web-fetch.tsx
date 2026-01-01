import { Loader2 } from "lucide-react";
import React, { memo } from "react";
import { Markdown } from "../../common/markdown";
import { ToolInvocation } from "../types";

export interface WebFetchRendererProps {
  toolInvocation: ToolInvocation;
}

/**
 * Special component for web-fetch tool calls
 */
export const WebFetchRenderer = memo(
  ({ toolInvocation }: WebFetchRendererProps) => {
    let isCompleted = false;
    let result = "";
    let url = "";
    let status = "";
    let contentType = "";

    // Extract URL from args
    url = String(toolInvocation.args?.url || "");

    // Check if the tool invocation has a result (AI SDK structure)
    if (toolInvocation.state === "result" && "result" in toolInvocation) {
      isCompleted = true;
      const toolResult = toolInvocation.result;

      if (toolResult && typeof toolResult === "object") {
        // Extract status information
        if (toolResult.status && toolResult.statusText) {
          status = `${toolResult.status} ${toolResult.statusText}`;
        }

        if (toolResult.contentType) {
          contentType = toolResult.contentType;
        }

        // Format the result for display
        if (toolResult.success && toolResult.content) {
          // Show successful fetch with content
          const parts: string[] = [];

          if (status) {
            parts.push(`Status: ${status}`);
          }

          if (contentType) {
            parts.push(`Content-Type: ${contentType}`);
          }

          parts.push(""); // Empty line
          parts.push("Content:");
          parts.push(toolResult.content);

          result = parts.join("\n");
        } else if (!toolResult.success) {
          // Show error information
          result = `Error: ${toolResult.error || toolResult.message || "Failed to fetch"}`;
        } else {
          // Fallback to message
          result = toolResult.message || "No content available";
        }
      } else if (typeof toolResult === "string") {
        result = toolResult;
      }
    }

    return (
      <div className="space-y-3">
        {/* Tool Call */}
        <div className="flex items-center gap-2 text-xs text-foreground/60 font-medium">
          <span>🌐 Fetching {url}</span>
          {!isCompleted && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>

        {/* Results */}
        {isCompleted && result && (
          <div className="space-y-1">
            <div className="text-xs text-foreground/60 font-medium">
              Response:
            </div>
            <div className="text-sm">
              {/* Use markdown for syntax highlighting if it looks like code */}
              {contentType.includes("json") ||
              contentType.includes("xml") ||
              contentType.includes("html") ? (
                <Markdown>{`\`\`\`${getLanguageFromContentType(contentType)}\n${result}\n\`\`\``}</Markdown>
              ) : (
                <Markdown>{`\`\`\`\n${result}\n\`\`\``}</Markdown>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
);

/**
 * Helper to determine language from content type for syntax highlighting
 */
function getLanguageFromContentType(contentType: string): string {
  if (contentType.includes("json")) return "json";
  if (contentType.includes("html")) return "html";
  if (contentType.includes("xml")) return "xml";
  if (contentType.includes("javascript")) return "javascript";
  if (contentType.includes("css")) return "css";
  return "text";
}

WebFetchRenderer.displayName = "WebFetchRenderer";
