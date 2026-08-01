import {
  dismissMentionHint,
  isMentionHintDismissed,
} from "@/renderer/libs/first-run";
import { X } from "lucide-react";
import React, { useState } from "react";

/**
 * The one mechanic that is not discoverable by looking: whether a message is
 * addressed to somebody. Sits above the composer, next to the thing it is
 * about, and never comes back once closed.
 */
export function MentionHint() {
  const [dismissed, setDismissed] = useState(isMentionHintDismissed);
  if (dismissed) return null;

  return (
    <div className="flex items-start gap-2 px-2 pb-1.5 text-xs text-muted-foreground">
      <p className="min-w-0 flex-1 leading-relaxed">
        <span className="font-medium">@</span> mentions a colleague directly; a
        bare message opens the floor.
      </p>
      <button
        type="button"
        onClick={() => {
          dismissMentionHint();
          setDismissed(true);
        }}
        className="flex-shrink-0 rounded p-0.5 transition-opacity pointer-events-auto hover:opacity-70"
        aria-label="Dismiss mention hint"
        title="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  );
}
