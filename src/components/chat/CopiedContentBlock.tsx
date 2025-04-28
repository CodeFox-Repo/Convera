import React, { useState, useEffect, useRef, memo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Component to show copied content with distinct styling
 */
const CopiedContentBlock = memo(({ children }: { children: React.ReactNode }) => {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

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

  return (
    <div 
      className="no-drag-region border-l-4 border-primary/50 bg-primary/5 my-2 p-3 rounded-md"
    >
      <div 
        className="text-primary/70 text-xs mb-1 font-medium flex items-center justify-between cursor-pointer"
        onClick={toggleExpanded}
      >
        <span>📋 Copied Content</span>
        <span className="text-foreground/50 text-xs flex items-center hover:text-primary transition-colors">
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
      <div 
        ref={contentRef}
        className="text-foreground/90 overflow-hidden relative transition-all duration-300"
        style={{ maxHeight: expanded ? `${contentHeight}px` : '80px' }}
      >
        {children}
        {!expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
        )}
      </div>
    </div>
  );
});

CopiedContentBlock.displayName = "CopiedContentBlock";

export default CopiedContentBlock; 