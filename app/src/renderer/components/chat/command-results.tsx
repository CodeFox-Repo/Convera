// Command Results Component
// A dynamic results list inspired by Raycast's clean, functional design
// Displays either command suggestions or AI chat preview based on input mode
import { cn } from "@/renderer/libs/utils/tailwind";
import { Settings } from "lucide-react";
import React from "react";

interface CommandResult {
  id: string;
  name: string;
  description: string;
  icon: string | React.ReactNode;
}

interface CommandResultsProps {
  results: CommandResult[];
  query: string;
  isCommandMode: boolean;
  selectedIndex: number;
  selectedInputCommand: CommandResult | null;
  commandResult: string;
  onCommandExecute: (command: CommandResult) => void;
  onAIChatSubmit: (message: string) => void;
  onSelectedIndexChange: (index: number) => void;
}

/**
 * CommandResults - A responsive results list that adapts to user input
 *
 * Design principles (Raycast-inspired):
 * - Information density without clutter
 * - Clear visual hierarchy with subtle hover states
 * - Fast visual feedback for keyboard navigation
 * - Minimal borders and shadows for a clean look
 *
 * Behavior:
 * - In command mode (/): Shows filtered command list
 * - In AI mode: Shows single "Ask AI" option with query preview
 */
const CommandResults: React.FC<CommandResultsProps> = ({
  results,
  query,
  isCommandMode,
  selectedIndex,
  selectedInputCommand,
  commandResult,
  onCommandExecute,
  onAIChatSubmit,
  onSelectedIndexChange,
}) => {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  // Input Change Command mode - show command result instead of command list
  if (selectedInputCommand && query.trim()) {
    return (
      <div className=" mt-2 w-full">
        <div className="rounded-lg border border-foreground/10 backdrop-blur-sm bg-white/5 shadow-sm overflow-hidden">
          <div>
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200",
                "hover:bg-foreground/8 active:bg-foreground/12 bg-foreground/8",
              )}
              onClick={() => onAIChatSubmit(commandResult)}
            >
              <div className="text-lg">{selectedInputCommand.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground text-sm">
                  {selectedInputCommand.name}
                </div>
                <div className="text-xs text-foreground/60 truncate">
                  {commandResult}
                </div>
              </div>
              <div className="text-xs text-foreground/40 flex items-center justify-center">
                ⏎
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isCommandMode) {
    return (
      <div className="mt-1.5  w-full">
        <div className="rounded-lg border border-foreground/10 backdrop-blur-sm bg-white/5 shadow-sm overflow-hidden">
          {results.length > 0 ? (
            <div className="max-h-96 overflow-y-auto">
              {results.slice(0, 6).map((command, index) => (
                <div
                  key={command.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200",
                    "hover:bg-foreground/8 active:bg-foreground/12",
                    // Only show keyboard selection highlight when mouse is not hovering
                    hoveredIndex === null &&
                      index === selectedIndex &&
                      "bg-foreground/8",
                  )}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => {
                    setHoveredIndex(null);
                    onSelectedIndexChange(index); // Update selectedIndex to last hovered position
                  }}
                  onClick={() => onCommandExecute(command)}
                >
                  <div className="text-lg flex items-center justify-center">
                    {command.icon === "Settings" ? (
                      <Settings size={16} className="text-foreground/70" />
                    ) : (
                      command.icon
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground text-sm">
                      {command.name}
                    </div>
                    <div className="text-xs text-foreground/60">
                      {command.description}
                    </div>
                  </div>
                  <div className="text-xs text-foreground/40 flex items-center justify-center">
                    ⏎
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-4 text-center text-foreground/60">
              <div className="text-base mb-1">🤔</div>
              <div className="text-xs">No commands found</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // AI Chat mode preview
  if (query.trim()) {
    return (
      <div className="mt-2 w-full">
        <div className="rounded-lg border border-foreground/10 backdrop-blur-sm bg-white/5 shadow-sm overflow-hidden">
          <div>
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200",
                "hover:bg-foreground/8 active:bg-foreground/12 bg-foreground/8",
              )}
              onClick={() => onAIChatSubmit(query)}
            >
              <div className="text-lg">🦊</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground text-sm">
                  Ask Foxy
                </div>
                <div className="text-xs text-foreground/60 truncate">
                  &ldquo;{query}&rdquo;
                </div>
              </div>
              <div className="text-xs text-foreground/40 flex items-center justify-center">
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

export default CommandResults;
