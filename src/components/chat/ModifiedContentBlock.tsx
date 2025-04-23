import React, { useState, useRef, useEffect, memo } from "react";
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";

interface ModifiedContentBlockProps {
  children: React.ReactNode;
  modifiedContent?: string;
  onAccept?: () => void;
  onReject?: () => void;
}

/**
 * Component to show modified content with accept/reject options
 */
const ModifiedContentBlock = memo(({ 
  children, 
  modifiedContent = "", 
  onAccept = () => {}, 
  onReject = () => {} 
}: ModifiedContentBlockProps) => {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);
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

  const handleReject = (e: React.MouseEvent) => {
    e.stopPropagation();
    onReject();
  };

  return (
    <div 
      className="no-drag-region border-l-4 border-violet-400/70 bg-violet-50/30 dark:bg-violet-900/10 my-2 p-3 rounded-md"
    >
      <div 
        className="text-violet-600 dark:text-violet-400 text-xs mb-1 font-medium flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-2" onClick={toggleExpanded}>
          <span>✏️ Modified Content</span>
          <span className="text-foreground/50 text-xs flex items-center hover:text-violet-500 transition-colors">
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
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
              isPasting 
                ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400" 
                : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/30"
            } transition-colors`}
          >
            <CheckCircle size={12} />
            <span>{isPasting ? "Pasting..." : "Accept"}</span>
          </button>
          <button 
            onClick={handleReject}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/30 transition-colors"
          >
            <XCircle size={12} />
            <span>Reject</span>
          </button>
        </div>
      </div>
      <div 
        ref={contentRef}
        className="text-foreground/90 overflow-hidden relative transition-all duration-300"
        style={{ maxHeight: expanded ? `${contentHeight}px` : '120px' }}
      >
        {children}
        {!expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-violet-50/30 dark:from-violet-900/10 to-transparent pointer-events-none" />
        )}
      </div>
    </div>
  );
});

ModifiedContentBlock.displayName = "ModifiedContentBlock";

export default ModifiedContentBlock; 