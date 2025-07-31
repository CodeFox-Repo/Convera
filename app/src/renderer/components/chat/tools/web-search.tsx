import { Loader2 } from "lucide-react";
import React, { memo } from "react";
import { Markdown } from "../../common/markdown";
import { ToolInvocation } from "../types";

export interface WebSearchRendererProps {
  toolInvocation: ToolInvocation;
}

/**
 * Special component for web_fetch tool calls
 */
export const WebSearchRenderer = memo(
  ({ toolInvocation }: WebSearchRendererProps) => {
    let isCompleted = false;
    let result = "";

    // Extract search query from args
    const searchQuery = String(
      toolInvocation.args?.query || toolInvocation.args?.url || "",
    );

    // Check if the tool invocation has a result (AI SDK structure)
    if (toolInvocation.state === "result" && "result" in toolInvocation) {
      isCompleted = true;
      const toolResult = toolInvocation.result;

      if (typeof toolResult === "string") {
        result = toolResult;
      } else if (typeof toolResult === "object") {
        if (toolResult.message) {
          result = toolResult.message as string;
        } else {
          result = JSON.stringify(toolResult, null, 2);
        }
      }
    }

    return (
      <div className="space-y-3">
        {/* Tool Call */}
        <div className="flex items-center gap-2 text-xs text-foreground/60 font-medium">
          <span>I will search {searchQuery}</span>
          {!isCompleted && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>

        {/* Tool Result */}
        {isCompleted && (
          <div className="space-y-1">
            <div className="text-xs text-foreground/60 font-medium">
              I found online:
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

WebSearchRenderer.displayName = "WebSearchRenderer";
