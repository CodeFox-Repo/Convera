import { Monitor, Plus, X } from "lucide-react";
import React from "react";

interface ContextButtonsProps {
  copiedContent: string | null;
  formatAppName: (name: string) => string;
  onRejectCopiedContent: () => void
}

export function ContextButtons({
  copiedContent,
  formatAppName,
  onRejectCopiedContent,
}: ContextButtonsProps) {
  return (
    <div className="h-6 flex flex-row items-center">
      <button
        className="h-6 no-drag-region flex items-center rounded-[var(--app-border-radius)] border border-gray-500/45
            bg-background/30 px-3 py-1 text-xs font-medium max-w-[36ch] hover:bg-background/50 transition-colors"
      >
        <Plus size={14} className="flex-shrink-0 mr-1" />
        {formatAppName("Add context")}
      </button>
      {copiedContent && (
        <div
          className="group relative h-6 no-drag-region flex items-center rounded-[var(--app-border-radius)] border border-gray-500/45
            bg-background/30 px-2 py-1 text-xs font-medium max-w-[16ch] ml-1 overflow-hidden pr-5"
        >
          <Monitor size={12} className="flex-shrink-0 mr-1" />
          <span className="truncate -mr-1">{formatAppName("clipboard")}</span>
          <button 
            onClick={() => {
              console.log("rejecting copied content");
              onRejectCopiedContent();
            }}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none"
            aria-label="Clear clipboard content"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
