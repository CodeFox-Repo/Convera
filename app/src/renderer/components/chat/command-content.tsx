// Command Content Component
// Displays MCP command results and AI chat responses in a larger content area
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { Bot, Loader2, Settings, User } from "lucide-react";
import React, { memo, useCallback, useEffect, useRef } from "react";
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
import { UIMessage } from "ai";
import "katex/dist/katex.min.css";

/**
 * Advanced markdown renderer component with syntax highlighting, math, and more
 */
const Markdown = memo(({ children }: { children: string }) => {
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

interface CommandContentProps {
  isVisible: boolean;
}

/**
 * CommandContent - Content display area for command results and AI chat
 *
 * Features:
 * - Shows MCP tool execution results with formatted output
 * - Displays AI chat messages in conversation format
 * - Larger content area with scrollable interface
 * - Clean typography for improved readability
 */
const CommandContent: React.FC<CommandContentProps> = ({ isVisible }) => {
  const { messages, isLoading } = useChatContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new messages arrive or when loading
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current && contentAreaRef.current) {
      // Force scroll to the bottom of the content area
      const scrollElement = contentAreaRef.current;
      scrollElement.scrollTop = scrollElement.scrollHeight;

      // Also use scrollIntoView as fallback
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Scroll to bottom when messages change or when loading
  useEffect(() => {
    if (isVisible) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [messages.length, isLoading, isVisible, scrollToBottom]);

  // Render message content with markdown support
  const renderMessageContent = useCallback((content: string) => {
    if (!content) return null;

    // Handle different content types
    if (typeof content === "string") {
      return <Markdown>{content}</Markdown>;
    }

    return (
      <div className="whitespace-pre-wrap break-words">{String(content)}</div>
    );
  }, []);

  // Render tool calls and results
  const renderToolContent = useCallback(
    (message: UIMessage | { toolName?: string; content: unknown }) => {
      if ("toolName" in message && message.toolName) {
        // This is a tool result
        return (
          <div className="bg-orange-500/10 rounded-md p-3 border-l-2 border-orange-500/30">
            <div className="text-xs font-medium text-orange-400 mb-2">
              Tool Result:{" "}
              {"toolName" in message ? message.toolName : "Unknown Tool"}
            </div>
            <div className="text-sm text-foreground/90">
              {typeof message.content === "string" ? (
                renderMessageContent(message.content)
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(message.content, null, 2)}
                </pre>
              )}
            </div>
          </div>
        );
      }

      // Handle assistant messages with tool calls
      if (message.content && Array.isArray(message.content)) {
        return (
          <div className="space-y-2">
            {message.content.map(
              (
                content: {
                  type: string;
                  text?: string;
                  toolName?: string;
                  args?: unknown;
                  result?: unknown;
                },
                i: number,
              ) => (
                <div key={i}>
                  {content.type === "text" &&
                    content.text &&
                    renderMessageContent(content.text)}
                  {content.type === "tool-call" && (
                    <div className="bg-blue-500/10 rounded-md p-3 border-l-2 border-blue-500/30">
                      <div className="text-xs font-medium text-blue-400 mb-1">
                        Tool Call: {content.toolName}
                      </div>
                      <div className="text-xs text-foreground/70 font-mono">
                        {JSON.stringify(content.args, null, 2)}
                      </div>
                    </div>
                  )}
                  {content.type === "tool-result" && (
                    <div className="bg-green-500/10 rounded-md p-3 border-l-2 border-green-500/30">
                      <div className="text-xs font-medium text-green-400 mb-1">
                        Tool Result
                      </div>
                      <div className="text-sm text-foreground/90">
                        {typeof content.result === "string" ? (
                          renderMessageContent(content.result)
                        ) : (
                          <pre className="text-xs font-mono whitespace-pre-wrap">
                            {JSON.stringify(content.result, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
        );
      }

      // Default text content
      const content =
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content || "");
      return renderMessageContent(content);
    },
    [renderMessageContent],
  );

  if (!isVisible) return null;

  return (
    <div className=" inset-0 w-full h-full flex flex-col">
      {/* Content Area - Full window scrollable */}
      <div
        ref={contentAreaRef}
        className="flex-1 overflow-y-auto px-3 mt-4 pb-3"
      >
        {messages.length === 0 && !isLoading ? (
          <div className="py-6 text-center text-foreground/60">
            <div className="text-base mb-2">💬</div>
            <div className="text-sm">No content yet</div>
          </div>
        ) : messages.length > 0 || isLoading ? (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={message.id || index} className="flex gap-3">
                {/* Avatar */}
                <div className="flex-shrink-0 mt-1">
                  {message.role === "user" ? (
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <User size={12} className="text-blue-500" />
                    </div>
                  ) : message.role === "assistant" ? (
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Bot size={12} className="text-green-500" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center">
                      <Settings size={12} className="text-orange-500" />
                    </div>
                  )}
                </div>

                {/* Message Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground/80 mb-1">
                    {message.role === "user"
                      ? "You"
                      : message.role === "assistant"
                        ? "AI"
                        : "Tool"}
                  </div>

                  <div className="text-sm text-foreground/90 leading-relaxed">
                    {renderToolContent(message)}
                  </div>

                  {/* Timestamp */}
                  <div className="text-xs text-foreground/40 mt-2">
                    {new Date(
                      message.createdAt || Date.now(),
                    ).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Bot size={12} className="text-green-500" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground/80 mb-1">
                    AI
                  </div>
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-foreground/60">
                      Thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} className="h-1" />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CommandContent;
