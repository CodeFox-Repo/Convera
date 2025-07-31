import React, { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
// Import highlight.js styles
import "highlight.js/styles/github-dark.css";
// Import KaTeX styles
import "katex/dist/katex.min.css";

/**
 * Shared markdown renderer component with syntax highlighting, math, and more
 */
export const Markdown = memo(({ children }: { children: string }) => {
  return (
    <div className="markdown no-drag-region max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[
          rehypeHighlight,
          rehypeKatex,
          [rehypeRaw, { passThrough: ["element"] }],
        ]}
        urlTransform={(value: string) => value}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});

Markdown.displayName = "Markdown";
