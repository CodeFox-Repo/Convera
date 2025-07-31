import { Loader2 } from "lucide-react";
import React, { memo } from "react";
import { Markdown } from "../../common/markdown";

export interface WebSearchRendererProps {
  toolInvocation: {
    toolCallId: string;
    toolName: string;
    state: string;
    args?: Record<string, unknown>;
    result?: string | { message?: string; [key: string]: unknown };
  };
}

/**
 * Special component for web_fetch tool calls
 */
export const WebSearchRenderer = memo(
  ({ toolInvocation }: WebSearchRendererProps) => {
    const isCompleted =
      toolInvocation.state === "complete" ||
      toolInvocation.state === "result" ||
      !!toolInvocation.result;

    // Extract search query from args
    const searchQuery = String(
      toolInvocation.args?.query || toolInvocation.args?.url || "",
    );

    // Process result
    let result = "";
    if (toolInvocation.result) {
      if (typeof toolInvocation.result === "string") {
        result = toolInvocation.result;
      } else if (typeof toolInvocation.result === "object") {
        if (toolInvocation.result.message) {
          result = toolInvocation.result.message as string;
        } else {
          result = JSON.stringify(toolInvocation.result, null, 2);
        }
      }
    }

    return (
      <div className="space-y-3">
        {/* Tool Call */}
        <div className="flex items-center gap-2 text-xs text-foreground/60 font-medium">
          <span>🔍 Searching for &ldquo;{searchQuery}&rdquo; online</span>
          {!isCompleted && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>

        {/* Tool Result */}
        {isCompleted && (
          <div className="space-y-1">
            <div className="text-xs text-foreground/60 font-medium">
              I found:
            </div>
            <div className="text-sm text-foreground pl-4">
              {typeof result === "string" ? (
                <Markdown>{result}</Markdown>
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/70">
                  {result}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
);

WebSearchRenderer.displayName = "WebFetchRenderer";
