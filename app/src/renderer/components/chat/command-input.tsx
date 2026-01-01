// Command Input Component
// A clean, minimal input field inspired by Raycast's design philosophy
// Supports both AI chat mode and command mode with "/" prefix
import { cn } from "@/renderer/libs/utils/tailwind";
import React, { forwardRef } from "react";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { X } from "lucide-react";

interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  isCommandMode: boolean;
  disabled?: boolean;
  placeholder?: string;
  selectedCommand?: { id: string; type?: string } | null;
}

/**
 * CommandInput - A unified input component for both AI chat and command execution
 *
 * Design notes:
 * - Minimal visual footprint with subtle glass morphism effect
 * - Command mode activated by "/" prefix, similar to Raycast
 * - Clean typography and spacing for optimal readability
 * - Responsive to theme changes with appropriate contrast ratios
 */
const CommandInput = forwardRef<HTMLInputElement, CommandInputProps>(
  (
    {
      value,
      onChange,
      onKeyPress,
      isCommandMode,
      disabled,
      placeholder,
      selectedCommand,
    },
    ref,
  ) => {
    const { selectedContent, setSelectedContent } = useChatContext();

    return (
      <div className="relative w-full">
        <div
          className={cn(
            "relative border border-foreground/10 rounded-lg transition-all duration-200 bg-white/5 backdrop-blur-sm",
            !disabled &&
              "focus-within:border-foreground/20 focus-within:ring-1 focus-within:ring-foreground/10",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {/* Selected Content Display Inside Input */}
          {selectedContent && selectedContent.text && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-foreground/10 animate-in fade-in slide-in-from-top-1 duration-200">
              <p className="text-sm text-foreground/70 line-clamp-2 flex-1 mr-2">
                {selectedContent.text}
              </p>
              <button
                onClick={() => setSelectedContent(null)}
                className="flex-shrink-0 p-1 rounded hover:bg-foreground/10 transition-colors"
                aria-label="Clear selected content"
              >
                <X className="w-3 h-3 text-foreground/50" />
              </button>
            </div>
          )}
          <div className="flex items-center ">
            {/* Command mode indicator - shows when user types "/" or in command input mode */}
            {(isCommandMode || selectedCommand) && (
              <div
                className={cn(
                  "ml-4 z-10 flex items-center justify-center",
                  isCommandMode && !selectedCommand && "-mr-4",
                )}
              >
                {selectedCommand && selectedCommand.type === "input-command" ? (
                  <span className="text-sm font-medium text-primary/60">
                    /{selectedCommand.id}
                  </span>
                ) : (
                  <span className="text-lg font-medium text-primary/60">/</span>
                )}
              </div>
            )}

            {/* Main input field with enhanced transparency for window blur */}
            <input
              ref={ref}
              type="text"
              value={
                isCommandMode && value.startsWith("/") ? value.slice(1) : value
              }
              onChange={(e) => {
                if (disabled) return;
                const newValue = e.target.value;
                // In command mode, always ensure the "/" prefix is maintained
                if (isCommandMode) {
                  onChange("/" + newValue);
                } else {
                  onChange(newValue);
                }
              }}
              onKeyDown={(e) => {
                if (disabled) return;
                // Handle backspace to exit command mode
                if (e.key === "Backspace" && isCommandMode && value === "/") {
                  e.preventDefault();
                  onChange("");
                }
                onKeyPress(e);
              }}
              placeholder={placeholder || "Ask AI or type / for commands"}
              className={cn(
                // Base styling - leverages window transparency for glass effect
                "w-full h-16 rounded-lg border-0",
                "text-foreground placeholder:text-foreground/50",
                "focus:outline-none",
                "transition-all duration-200 ease-in-out",
                "text-base font-medium",
                // Adaptive padding based on mode and active app badge
                isCommandMode ? "pl-6 pr-4" : "pl-2",
                // Transparent background to show window blur
                "bg-transparent backdrop-blur-none text-lg",
                // Disabled state
                disabled && "cursor-not-allowed",
              )}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    );
  },
);

CommandInput.displayName = "CommandInput";

export default CommandInput;
