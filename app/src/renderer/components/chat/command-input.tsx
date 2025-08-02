// Command Input Component
// A clean, minimal input field inspired by Raycast's design philosophy
// Supports both AI chat mode and command mode with "/" prefix
import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";
import { cn } from "@/renderer/libs/utils/tailwind";
import { iconCache } from "@/renderer/libs/utils/icon-cache";
import React, { forwardRef, useState, useEffect } from "react";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { X } from "lucide-react";

// Small app icon component for the bottom-left indicator
function AppIcon({ appName }: { appName: string }) {
  const [iconPath, setIconPath] = useState<string | null>(() => {
    if (iconCache.has(appName)) {
      const cached = iconCache.get(appName);
      return cached !== undefined ? cached : null;
    }
    return null;
  });
  const [isLoadingIcon, setIsLoadingIcon] = useState(() => {
    return !iconCache.has(appName);
  });

  useEffect(() => {
    if (iconCache.has(appName)) {
      const cached = iconCache.get(appName);
      setIconPath(cached !== undefined ? cached : null);
      setIsLoadingIcon(false);
      return;
    }

    const loadIcon = async () => {
      if (!window.activeAppAPI) return;

      setIsLoadingIcon(true);
      try {
        const icon = await window.activeAppAPI.getAppIcon(appName);
        setIconPath(icon);
        iconCache.set(appName, icon);
      } catch (error) {
        console.error(`Failed to load icon for ${appName}:`, error);
        setIconPath(null);
        iconCache.set(appName, null);
      } finally {
        setIsLoadingIcon(false);
      }
    };

    loadIcon();
  }, [appName]);

  if (isLoadingIcon) {
    return (
      <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
    );
  }

  if (iconPath) {
    return (
      <img
        src={iconPath.startsWith("data:") ? iconPath : `file://${iconPath}`}
        alt={`${appName} icon`}
        className="w-4 h-4 rounded-sm object-cover"
        onError={() => {
          setIconPath(null);
          iconCache.set(appName, null);
        }}
        loading="lazy"
      />
    );
  }

  // Fallback to green dot
  return <div className="w-2 h-2 rounded-full bg-green-500/80" />;
}

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
    const { previousApp, formatAppName } = usePreviousApp();
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
                  previousApp ? "top-7" : "top-7",
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

          {/* Active app badge - positioned inside input border at bottom left */}

          <div className="pl-2">
            {previousApp && (
              <div className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-foreground/60">
                <AppIcon appName={previousApp} />
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
