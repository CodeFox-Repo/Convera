// Command Input Component
// A clean, minimal input field inspired by Raycast's design philosophy
// Supports both AI chat mode and command mode with "/" prefix
import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";
import { cn } from "@/renderer/libs/utils/tailwind";
import React, { forwardRef } from "react";

interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  isCommandMode: boolean;
  disabled?: boolean;
  placeholder?: string;
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
  ({ value, onChange, onKeyPress, isCommandMode, disabled, placeholder }, ref) => {
    const { previousApp, formatAppName } = usePreviousApp();

    return (
      <div className="relative w-full">
        <div className={cn(
          "relative border border-foreground/10 rounded-lg transition-all duration-200 bg-white/5 backdrop-blur-sm",
          !disabled && "focus-within:border-foreground/20 focus-within:ring-1 focus-within:ring-foreground/10",
          disabled && "opacity-50 cursor-not-allowed"
        )}>
          {/* Command mode indicator - shows when user types "/" */}
          {isCommandMode && (
            <div
              className={cn(
                "absolute left-4 -translate-y-1/2 text-primary/60 z-10 flex items-center justify-center",
                previousApp ? "top-7" : "top-7",
              )}
            >
              <span className="text-lg font-medium">/</span>
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
              "w-full h-14 rounded-lg border-0",
              "text-foreground placeholder:text-foreground/50",
              "focus:outline-none",
              "transition-all duration-200 ease-in-out",
              "text-base font-medium",
              // Adaptive padding based on mode and active app badge
              isCommandMode ? "pl-7 pr-4" : "px-4",
              // Transparent background to show window blur
              "bg-transparent backdrop-blur-none text-lg",
              // Disabled state
              disabled && "cursor-not-allowed"
            )}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
          />

          {/* Active app badge - positioned inside input border at bottom left */}

          <div className="pl-2">
            {previousApp && (
              <div className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-foreground/60">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500/80" />
                <span>{formatAppName(previousApp)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

CommandInput.displayName = "CommandInput";

export default CommandInput;
