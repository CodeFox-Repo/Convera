import { Copy, ExternalLink, X } from "lucide-react";
import React, { useState } from "react";

interface CopiedContentCardProps {
  content: string;
  onReject: () => void;
}

const CopiedContentCard: React.FC<CopiedContentCardProps> = ({
  content,
  onReject,
}) => {
  const [showPreview, setShowPreview] = useState(false);

  const formatContentPreview = () => {
    const maxLength = 50;
    const textContent = content.trim();
    if (textContent.length <= maxLength) return textContent;
    return textContent.substring(0, maxLength) + "...";
  };

  return (
    <>
      <div className="no-drag-region flex w-full items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
        <div className="flex items-center gap-2">
          {content ? (
            <>
              <Copy size={14} className="text-primary/70" />
              <button
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-1 text-sm text-primary/80 hover:text-primary"
              >
                <span>{formatContentPreview()}</span>
                <ExternalLink size={12} />
              </button>
            </>
          ) : (
            <button className="text-sm text-primary/80 hover:text-primary">
              Add Context
            </button>
          )}
        </div>
        {content && (
          <button
            onClick={onReject}
            className="text-destructive hover:text-destructive/80"
            aria-label="Discard content"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="m-4 max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg bg-background p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium">Clipboard Content</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            <pre className="overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-4 text-sm">
              {content}
            </pre>
          </div>
        </div>
      )}
    </>
  );
};

export default CopiedContentCard;
