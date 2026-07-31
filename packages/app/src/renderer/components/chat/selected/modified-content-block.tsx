import { CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import React, { memo, useEffect, useRef, useState } from "react";

interface ModifiedContentBlockProps {
  children: React.ReactNode;
  modifiedContent?: string;
  onAccept?: () => void;
  onReject?: () => void;
}

/**
 * Component to show modified content with accept/reject options
 */
const ModifiedContentBlock = memo(
  ({
    children,
    modifiedContent = "",
    onAccept = () => {},
  }: ModifiedContentBlockProps) => {
    const [expanded, setExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentHeight, setContentHeight] = useState<number | undefined>(
      undefined,
    );
    const [isPasting, setIsPasting] = useState(false);

    // Get the full height of the content when mounted
    useEffect(() => {
      if (contentRef.current) {
        const height = contentRef.current.scrollHeight;
        setContentHeight(height);
      }
    }, [children]);

    const toggleExpanded = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpanded(!expanded);
    };

    const handleAccept = async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsPasting(true);

      try {
        // Get the raw content (without markdown) for pasting
        const contentToPaste = modifiedContent.trim();

        if (contentToPaste) {
          // Use the IPC API to paste the content in the previous app
          if (window.electronAPI) {
            await window.electronAPI.pasteModifiedContent(contentToPaste);
          }
        }

        // Call the onAccept callback
        onAccept();
      } catch (error) {
        console.error("Error pasting content:", error);
      } finally {
        setIsPasting(false);
      }
    };

    return (
      <div className="no-drag-region my-2 rounded-md border-l-4 border-violet-400/70 bg-violet-50/30 p-3 dark:bg-violet-900/10">
        <div className="mb-1 flex cursor-pointer items-center justify-between text-xs font-medium text-violet-600 dark:text-violet-400">
          <div className="flex items-center gap-2" onClick={toggleExpanded}>
            <span>✏️ Modified Content</span>
            <span className="text-foreground/50 flex items-center text-xs transition-colors hover:text-violet-500">
              {expanded ? (
                <>
                  <span className="mr-1">Collapse</span>
                  <ChevronUp size={14} />
                </>
              ) : (
                <>
                  <span className="mr-1">Expand</span>
                  <ChevronDown size={14} />
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAccept}
              disabled={isPasting}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                isPasting
                  ? "bg-muted text-muted-foreground"
                  : "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-800/30"
              } transition-colors`}
            >
              <CheckCircle size={12} />
              <span>{isPasting ? "Applying..." : "Apply"}</span>
            </button>
          </div>
        </div>
        <div
          ref={contentRef}
          className="text-foreground/90 relative overflow-hidden transition-all duration-300"
          style={{ maxHeight: expanded ? `${contentHeight}px` : "120px" }}
        >
          {children}
          {!expanded && (
            <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-t from-violet-50/30 to-transparent dark:from-violet-900/10" />
          )}
        </div>
      </div>
    );
  },
);

ModifiedContentBlock.displayName = "ModifiedContentBlock";

export default ModifiedContentBlock;
