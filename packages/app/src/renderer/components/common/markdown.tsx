import React, { memo } from "react";
import { Streamdown } from "streamdown";
// Import KaTeX styles (used by streamdown for math)
import "katex/dist/katex.min.css";

/**
 * Shared markdown renderer component with syntax highlighting, math, and more
 * Using Streamdown for better AI streaming support
 */
export const Markdown = memo(
  ({ children, isStreaming }: { children: string; isStreaming?: boolean }) => {
    return (
      <div className="markdown no-drag-region max-w-none">
        <Streamdown
          mode={isStreaming ? "streaming" : "static"}
          shikiTheme={["github-dark", "github-light"]}
          controls={{
            code: true,
            table: true,
            mermaid: true,
          }}
        >
          {children}
        </Streamdown>
      </div>
    );
  },
);

Markdown.displayName = "Markdown";
