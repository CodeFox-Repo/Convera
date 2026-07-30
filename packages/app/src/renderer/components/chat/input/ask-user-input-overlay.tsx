import { useUserInputStore } from "@/renderer/libs/stores/user-input-store";
import { Send } from "lucide-react";
import React, { useState } from "react";

export function AskUserInputOverlay() {
  const [customInput, setCustomInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [responseError, setResponseError] = useState<string>();
  const { pendingInputs, resolvePendingInput } = useUserInputStore();
  const pending = pendingInputs.values().next().value;

  if (!pending) return null;

  const submit = async (value: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setResponseError(undefined);
    try {
      await resolvePendingInput(pending.interactionId, value);
      setCustomInput("");
    } catch (error) {
      setResponseError(
        error instanceof Error ? error.message : "Could not send response.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const customInputEnabled = pending.kind === "input";
  const details =
    pending.kind === "approval" && pending.input !== undefined
      ? JSON.stringify(pending.input, null, 2)
      : undefined;

  return (
    <div className="rounded-2xl border border-border">
      <div className="px-4 pt-3 text-xs font-medium text-muted-foreground">
        {pending.kind === "approval"
          ? `Approval required · ${pending.name}`
          : pending.name}
      </div>
      <div className="px-4 pt-2 pb-2 text-sm text-foreground whitespace-pre-wrap">
        {pending.question}
      </div>

      {details && (
        <pre className="mx-4 mb-2 max-h-32 overflow-auto rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
          {details}
        </pre>
      )}

      <div className="space-y-1 px-4">
        {pending.options.map((option) => (
          <button
            key={option}
            onClick={() => void submit(option)}
            disabled={isSubmitting}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {option}
          </button>
        ))}
      </div>

      {responseError && (
        <div className="px-4 pt-2 text-xs text-destructive">
          {responseError}
        </div>
      )}

      {customInputEnabled && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2">
            <input
              type="text"
              placeholder="Other..."
              value={customInput}
              onChange={(event) => setCustomInput(event.target.value)}
              disabled={isSubmitting}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (customInput.trim()) void submit(customInput.trim());
                }
              }}
              className="h-6 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
              autoFocus
            />
            {customInput.trim() && (
              <button
                onClick={() => void submit(customInput.trim())}
                disabled={isSubmitting}
                aria-label="Submit custom response"
                className="rounded p-1 text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
