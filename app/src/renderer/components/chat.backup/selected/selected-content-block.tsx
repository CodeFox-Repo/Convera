import { ChevronDown, ChevronUp, Clipboard, Image } from "lucide-react";
import React, { memo, useEffect, useRef, useState } from "react";
import { SelectedContent } from "@/renderer/libs/stores/chat-store";

/**
 * Component to show selected content with subtle styling matching attachment pattern
 */
const SelectedContentBlock = memo(
  ({ content }: { content: SelectedContent }) => {
    const [expanded, setExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentHeight, setContentHeight] = useState<number | undefined>(
      undefined,
    );

    // Get the full height of the content when mounted
    useEffect(() => {
      if (contentRef.current) {
        const height = contentRef.current.scrollHeight;
        setContentHeight(height);
      }
    }, [content]);

    const toggleExpanded = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpanded(!expanded);
    };

    return (
      <div className="no-drag-region my-2 rounded-md border border-border bg-background/50 p-3">
        <div
          className="mb-1 flex cursor-pointer items-center justify-between text-xs font-medium text-muted-foreground"
          onClick={toggleExpanded}
        >
          <div className="flex items-center gap-2">
            {content.imageData ? <Image size={12} /> : <Clipboard size={12} />}
            <span>
              {content.imageData && content.text
                ? "Screenshot + Text"
                : content.imageData
                  ? "Screenshot"
                  : "Selected Content"}
            </span>
          </div>
          <span className="flex items-center text-xs transition-colors hover:text-foreground">
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
          className="text-foreground/90 relative overflow-hidden transition-all duration-300"
          style={{ maxHeight: expanded ? `${contentHeight}px` : "120px" }}
        >
          {content.imageData && (
            <div className="mb-2">
              <img
                src={
                  content.imageData.startsWith("data:")
                    ? content.imageData
                    : `data:image/png;base64,${content.imageData}`
                }
                alt="Screenshot"
                className="max-w-full h-auto rounded border border-border"
                style={{ maxHeight: "200px" }}
              />
            </div>
          )}
          {content.text && (
            <pre className="text-sm whitespace-pre-wrap font-mono text-foreground/90 break-words">
              {content.text}
            </pre>
          )}
          {!expanded && (
            <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-t from-background/50 to-transparent" />
          )}
        </div>
      </div>
    );
  },
);

SelectedContentBlock.displayName = "SelectedContentBlock";

export default SelectedContentBlock;
