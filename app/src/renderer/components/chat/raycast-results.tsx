// app/src/renderer/components/chat/raycast-results.tsx
import React from "react";
import { cn } from "@/renderer/libs/utils/tailwind";

interface CommandResult {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface RaycastResultsProps {
  results: CommandResult[];
  query: string;
  isCommandMode: boolean;
  onCommandExecute: (command: CommandResult) => void;
  onAIChatSubmit: (message: string) => void;
}

const RaycastResults: React.FC<RaycastResultsProps> = ({
  results,
  query,
  isCommandMode,
  onCommandExecute,
  onAIChatSubmit,
}) => {
  if (isCommandMode) {
    return (
      <div className="mt-3 w-full">
        <div className="rounded-lg border border-border/20 bg-background/50 backdrop-blur-sm shadow-sm overflow-hidden">
          {results.length > 0 ? (
            <div className="py-2">
              {results.map((command, index) => (
                <div
                  key={command.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                    "hover:bg-primary/10 active:bg-primary/20",
                    index === 0 && "bg-primary/5" // Highlight first result
                  )}
                  onClick={() => onCommandExecute(command)}
                >
                  <div className="text-xl">{command.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{command.name}</div>
                    <div className="text-sm text-muted-foreground/80">{command.description}</div>
                  </div>
                  <div className="text-xs text-muted-foreground/60">
                    ⏎
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-muted-foreground/60">
              <div className="text-lg mb-1">🤔</div>
              <div className="text-sm">No commands found</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // AI Chat mode preview
  if (query.trim()) {
    return (
      <div className="mt-3 w-full">
        <div className="rounded-lg border border-border/20 bg-background/50 backdrop-blur-sm shadow-sm overflow-hidden">
          <div className="py-2">
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                "hover:bg-primary/10 active:bg-primary/20 bg-primary/5"
              )}
              onClick={() => onAIChatSubmit(query)}
            >
              <div className="text-xl">🤖</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">Ask AI</div>
                <div className="text-sm text-muted-foreground/80 truncate">
                  &ldquo;{query}&rdquo;
                </div>
              </div>
              <div className="text-xs text-muted-foreground/60">
                ⏎
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default RaycastResults;