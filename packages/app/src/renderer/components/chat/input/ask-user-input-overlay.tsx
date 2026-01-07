import { useUserInputStore } from "@/renderer/libs/stores/user-input-store";
import { Send } from "lucide-react";
import React, { useState } from "react";

/**
 * Overlay component that replaces ChatInput when waiting for user input.
 * Only rendered when there's a pending input request (controlled by ChatInputContainer).
 */
export function AskUserInputOverlay() {
  const [customInput, setCustomInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { pendingInputs, resolvePendingInput } = useUserInputStore();

  // Get the first pending input (there should typically only be one)
  const pendingEntries = Array.from(pendingInputs.entries());
  const pending = pendingEntries.length > 0 ? pendingEntries[0][1] : null;

  // Safety check - shouldn't happen since parent controls rendering
  if (!pending) return null;

  const { toolCallId, question, options } = pending;

  // Handle option selection
  const handleOptionSelect = (option: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    resolvePendingInput(toolCallId, option);
    setTimeout(() => {
      setIsSubmitting(false);
      setCustomInput("");
    }, 100);
  };

  // Handle custom input submission
  const handleCustomSubmit = () => {
    if (isSubmitting || !customInput.trim()) return;
    setIsSubmitting(true);
    resolvePendingInput(toolCallId, customInput.trim());
    setTimeout(() => {
      setIsSubmitting(false);
      setCustomInput("");
    }, 100);
  };

  return (
    <div className="rounded-2xl border border-border bg-background">
      {/* Question */}
      <div className="px-4 pt-3 pb-2 text-sm text-muted-foreground">
        {question}
      </div>

      {/* Options */}
      <div className="px-4 space-y-1">
        {options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleOptionSelect(option)}
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted rounded-lg disabled:opacity-50 transition-colors"
          >
            {option}
          </button>
        ))}
      </div>

      {/* Custom input */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-lg">
          <input
            type="text"
            placeholder="Other..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            disabled={isSubmitting}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleCustomSubmit();
              }
            }}
            className="flex-1 h-6 text-sm bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground disabled:opacity-50"
            autoFocus
          />
          {customInput.trim() && (
            <button
              onClick={handleCustomSubmit}
              disabled={isSubmitting}
              className="p-1 text-primary hover:bg-primary/10 rounded disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
