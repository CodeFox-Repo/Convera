import { Check, Copy } from "lucide-react";
import React, { memo, useState } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  showCopyButton?: boolean;
}

/**
 * CodeBlock component with copy functionality
 */
export const CodeBlock = memo(
  ({
    code,
    language = "text",
    title,
    showCopyButton = true,
  }: CodeBlockProps) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
      }
    };

    return (
      <div className="relative group">
        {/* Header with title and copy button */}
        <div
          className="flex items-center justify-between px-3 py-1.5 border  border-foreground/10 bg-foreground/5"
          style={{
            borderTopLeftRadius: "0.375rem",
            borderTopRightRadius: "0.375rem",
          }}
        >
          <span className="text-xs text-foreground/60">
            {title || language}
          </span>
          {showCopyButton && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground/80 transition-colors"
              aria-label="Copy code"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Code content */}
        <pre
          className="px-3 pb-3 pt-2 border border-t-0 border-foreground/10  bg-foreground/5 overflow-x-auto "
          style={{
            borderBottomLeftRadius: "0.375rem",
            borderBottomRightRadius: "0.375rem",
          }}
        >
          <code
            className={`text-sm text-foreground/70 whitespace-pre-wrap language-${language}`}
          >
            {code}
          </code>
        </pre>
      </div>
    );
  },
);

CodeBlock.displayName = "CodeBlock";
