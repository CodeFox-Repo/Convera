import { Monitor, Plus } from "lucide-react";
import React from "react";

interface ContextButtonsProps {
  copiedContent: string | null;
  formatAppName: (name: string) => string;
}

export function ContextButtons({
  copiedContent,
  formatAppName,
}: ContextButtonsProps) {
  return (
    <div className="h-6 flex flex-row">
      <button
        className="h-6 no-drag-region flex items-center rounded-[var(--app-border-radius)] border border-gray-500/45
            bg-background/30 px-3 py-1 text-xs font-medium max-w-[36ch]"
      >
        <Plus size={14} className="flex-shrink-0 " />
        {formatAppName("Add context")}
      </button>
      {copiedContent && (
        <div
          className="h-6 no-drag-region flex items-center rounded-[var(--app-border-radius)] border border-gray-500/45
            bg-background/30 px-2 py-1 text-xs font-medium max-w-[14ch] ml-1 overflow-hidden"
        >
          <Monitor size={12} className="flex-shrink-0 m-1" />
          {formatAppName("clipboard")}
        </div>
      )}
    </div>
  );
}
