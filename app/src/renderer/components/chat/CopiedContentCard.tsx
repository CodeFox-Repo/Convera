import React from "react";
import { X, Copy } from "lucide-react";

interface CopiedContentCardProps {
  content: string;
  onReject: () => void;
}

const CopiedContentCard: React.FC<CopiedContentCardProps> = ({
  content,
  onReject,
}) => {
  // Function to truncate and format content for preview
  const formatContent = () => {
    const maxLength = 150;
    const lines = content.split("\n");
    const truncatedLines = lines.slice(0, 5);
    
    let displayContent = truncatedLines.join("\n");
    
    if (displayContent.length > maxLength) {
      displayContent = displayContent.substring(0, maxLength) + "...";
    } else if (lines.length > 5) {
      displayContent += "\n...";
    }
    
    return displayContent;
  };

  return (
    <div className="no-drag-region w-full rounded-[var(--app-border-radius)] border-1 border-gray-500/45 bg-background/80 shadow-md overflow-hidden">
      <div className="flex items-center justify-between bg-primary/10 px-3 py-2">
        <div className="flex items-center text-sm font-medium text-primary">
          <Copy size={14} className="mr-1" />
          Copied Content (will be sent automatically)
        </div>
        <div className="flex items-center">
          <button
            onClick={onReject}
            className="flex items-center rounded-md bg-destructive/20 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/30"
            aria-label="Discard content"
          >
            <X size={12} className="mr-1" />
            Discard
          </button>
        </div>
      </div>
      <div className="max-h-[90px] overflow-auto p-2 text-xs font-mono border-primary/20">
        {formatContent()}
      </div>
      <div className="px-2 py-1 text-xs text-muted-foreground bg-background/80">
        {content.length} characters, {content.split("\n").length} lines
      </div>
    </div>
  );
};

export default CopiedContentCard; 