import { Loader2 } from "lucide-react";
import React, { memo } from "react";
import { ToolInvocation } from "../types";
import { CodeBlock } from "../../common/code-block";

export interface ExecuteCommandRendererProps {
  toolInvocation: ToolInvocation;
}

/**
 * Special component for execute-command tool calls
 */
export const ExecuteCommandRenderer = memo(
  ({ toolInvocation }: ExecuteCommandRendererProps) => {
    let isCompleted = false;
    let result = "";
    let command = "";

    // Extract command from args
    command = String(toolInvocation.args?.command || "");

    // Check if the tool invocation has a result (AI SDK structure)
    if (toolInvocation.state === "result" && "result" in toolInvocation) {
      isCompleted = true;
      const toolResult = toolInvocation.result;

      if (toolResult && typeof toolResult === "object") {
        const resultObj = toolResult;

        // Build result output similar to terminal output
        const parts: string[] = [];

        // Add stdout if exists
        if (resultObj.stdout && String(resultObj.stdout).trim()) {
          parts.push(String(resultObj.stdout).trim());
        }

        // Add stderr if exists (in a different style)
        if (resultObj.stderr && String(resultObj.stderr).trim()) {
          if (parts.length > 0) parts.push(""); // Add empty line
          parts.push(`[stderr]\n${String(resultObj.stderr).trim()}`);
        }

        // If there's an error message, add it
        if (!resultObj.success && resultObj.message) {
          if (parts.length > 0) parts.push(""); // Add empty line
          parts.push(`[error] ${resultObj.message}`);
        }

        result = parts.join("\n");
      } else if (typeof toolResult === "string") {
        result = toolResult;
      }
    }

    return (
      <div className="space-y-3">
        {/* Tool Call */}
        <div className="flex items-center gap-2 text-xs text-foreground/60 font-medium">
          <span>I will execute the command</span>
          {!isCompleted && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>

        {/* Combined command and output in single code block */}
        <CodeBlock
          code={`${command ? `$ ${command}` : ''}${!isCompleted && command ? '\n\n[executing...]' : ''}${isCompleted && result ? '\n' + result : ''}`}
          language="bash"
          title="Terminal"
          showCopyButton={isCompleted}
        />
      </div>
    );
  },
);

ExecuteCommandRenderer.displayName = "ExecuteCommandRenderer";
