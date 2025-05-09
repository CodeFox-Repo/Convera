import React, { useState } from "react";
import { ChevronUp, ChevronDown, Code, Loader } from "lucide-react";

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
    <div className="border-foreground/10 bg-foreground/5 no-drag-region my-3 rounded-md border p-2">
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <Code className="text-foreground/80 mr-2 h-4 w-4" />
          <span className="text-sm font-medium">{tool}</span>
        </div>
        <span className="bg-foreground/10 text-foreground/70 flex items-center gap-1 rounded px-2 py-0.5 text-xs">
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
        <div className="mt-2 text-xs">
          <div className="mb-2">
            <div className="text-foreground/60 mb-1 font-medium">
              Arguments:
            </div>
            <pre className="bg-foreground/10 max-h-40 overflow-auto rounded p-2">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>

          <div>
            <div className="text-foreground/60 mb-1 font-medium">Result:</div>
            <div className="bg-foreground/10 max-h-60 overflow-auto rounded p-2 whitespace-pre-wrap">
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
