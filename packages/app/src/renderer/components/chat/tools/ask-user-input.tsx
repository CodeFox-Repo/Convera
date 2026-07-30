import { Loader2 } from "lucide-react";
import React, { memo } from "react";
import { ToolInvocation } from "../types";

export interface AskUserInputRendererProps {
  toolInvocation: ToolInvocation;
}

/**
 * Minimal UI component for ask_user_input tool calls in message stream.
 * Shows the question with loading state or completed result.
 * The actual input UI is handled by AskUserInputOverlay in the input area.
 */
export const AskUserInputRenderer = memo(
  ({ toolInvocation }: AskUserInputRendererProps) => {
    const args = toolInvocation.args as {
      question?: string;
      options?: string[];
    };
    const question = args?.question || "Waiting for your input...";

    // Check if completed (has result)
    const isCompleted =
      toolInvocation.state === "result" && "result" in toolInvocation;

    // If completed, show the question and user's answer
    if (isCompleted) {
      const result = toolInvocation.result;
      const resultObject =
        result && typeof result === "object"
          ? (result as Record<string, unknown>)
          : undefined;
      const userSelection = resultObject?.userSelection
        ? String(resultObject.userSelection)
        : String(result);

      return (
        <div className="text-sm space-y-1">
          <div className="text-muted-foreground">{question}</div>
          <div className="text-foreground">→ {userSelection}</div>
        </div>
      );
    }

    // Waiting state - show question with loading indicator
    return (
      <div className="text-sm space-y-1">
        <div className="text-muted-foreground">{question}</div>
        <div className="flex items-center gap-2 text-muted-foreground/70">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Waiting for your response...</span>
        </div>
      </div>
    );
  },
);

AskUserInputRenderer.displayName = "AskUserInputRenderer";
