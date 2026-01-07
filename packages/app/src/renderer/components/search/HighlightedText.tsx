import React, { useMemo } from "react";
import { highlightSearchTerm } from "@/renderer/libs/utils/conversation-search-utils";

interface HighlightedTextProps {
  text: string;
  query: string;
  className?: string;
}

export function HighlightedText({
  text,
  query,
  className,
}: HighlightedTextProps) {
  const segments = useMemo(
    () => highlightSearchTerm(text, query),
    [text, query],
  );

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.highlighted ? (
          <mark
            key={index}
            className="bg-yellow-200 dark:bg-yellow-800 text-inherit rounded-sm px-0.5"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </span>
  );
}
