import { ChevronDown, ChevronUp, Code, Loader } from "lucide-react";
import React, { useState } from "react";

interface ToolCallProps {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  isCompleted?: boolean;
}

/**
 * Tool Call component to display tool invocations in an expanded/collapsed view
 */
const ToolCall = ({
  tool,
  args,
  result,
  isCompleted = false,
}: ToolCallProps) => {
  // Auto-collapse completed tool calls
  const [isExpanded, setIsExpanded] = useState(!isCompleted);

  return (
    <div className="no-drag-region my-3 rounded-md border border-border bg-background/50 p-3">
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <Code className="mr-2 h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{tool}</span>
        </div>
        <span className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
          {isExpanded ? (
            <>
              <ChevronUp size={12} /> Hide Details
            </>
          ) : (
            <>
              <ChevronDown size={12} /> Show Details
            </>
          )}
        </span>
      </div>

      {isExpanded && (
        <div className="mt-3 text-xs space-y-3">
          <div>
            <div className="mb-2 font-medium text-muted-foreground">
              Arguments:
            </div>
            <pre className="max-h-40 overflow-auto rounded border border-border bg-muted/30 p-2 text-foreground">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>

          <div>
            <div className="mb-2 font-medium text-muted-foreground">
              Result:
            </div>
            <div className="max-h-60 overflow-auto rounded border border-border bg-muted/30 p-2 whitespace-pre-wrap text-foreground">
              {!isCompleted ? (
                <div className="flex items-center text-amber-500">
                  <Loader className="mr-2 h-3 w-3 animate-spin" />
                  Waiting for results...
                </div>
              ) : (
                result
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolCall;
