// Command Content Component
// Displays MCP command results and AI chat responses in a larger content area
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { Bot, Loader2, Sparkles } from "lucide-react";
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
  const { messages, isLoading, currentConversationId } = useChatContext();
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
          <div className="space-y-6">
            {/* Group messages into user-assistant pairs */}
            {(() => {
              const messagePairs = [];
              for (let i = 0; i < messages.length; i += 2) {
                const userMessage = messages[i];
                const assistantMessage = messages[i + 1];

                if (userMessage?.role === "user") {
                  messagePairs.push({
                    user: userMessage,
                    assistant: assistantMessage,
                    index: i,
                  });
                }
              }

              return messagePairs.map((pair, pairIndex) => {
                const isLastPair = pairIndex === messagePairs.length - 1;

                return (
                  <div key={pair.user.id || pair.index} className="space-y-3">
                    {/* Card containing both user and assistant messages */}
                    <div className="rounded-lg border border-foreground/10 px-4 py-2 space-y-0">
                      {/* User message */}
                      <div className="text-muted-foreground">
                        {renderToolContent(pair.user)}
                      </div>

                      {/* Assistant message (if exists) */}
                      {pair.assistant && (
                        <div className="text-foreground leading-relaxed">
                          {renderToolContent(pair.assistant)}
                        </div>
                      )}

                      {/* Loading indicator inside card when AI is thinking */}
                      {isLastPair && isLoading && !pair.assistant && (
                        <div className="text-foreground leading-relaxed">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm text-foreground/60">
                              Foxy Thinking...
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom section with model and continue button - only after last pair, no divider */}
                    {isLastPair && pair.assistant && (
                      <div className="flex items-center justify-between ">
                        <div className="flex items-center gap-2 text-xs text-foreground/60">
                          <Bot size={12} />
                          <span>GPT-4o mini</span>
                        </div>
                        <button 
                          onClick={() => {
                            if (currentConversationId && window.electronAPI?.toggleWindow) {
                              console.log("Continue in Chat button - switching with conversation:", currentConversationId);
                              
                              // Pass conversation ID to main window via localStorage
                              localStorage.setItem("switchToConversation", currentConversationId);
                              
                              // Trigger storage event for same-window detection
                              window.dispatchEvent(new StorageEvent("storage", {
                                key: "switchToConversation",
                                newValue: currentConversationId,
                                oldValue: null
                              }));
                              
                              // Hide current chat window and show main window
                              window.electronAPI.toggleWindow("chat"); // Hide chat
                              window.electronAPI.toggleWindow("main");  // Show main
                            }
                          }}
                          className="text-xs text-foreground/60 hover:text-foreground/80 transition-colors flex items-center gap-1"
                        >
                          <span>Continue in Chat</span>
                          <span className="text-[10px] px-1 py-0.5 rounded border border-foreground/20">
                            ⌘
                          </span>
                          <span className="text-[10px] px-1 py-0.5 rounded border border-foreground/20">
                            J
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              });
            })()}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} className="h-1" />
          </div>
        ) : null}
      </div>

      {/* Footer - shown when there are messages or loading */}
      {(messages.length > 0 || isLoading) && (
        <div className="px-3 border-t border-foreground/10 bg-foreground/10">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2 text-xs text-foreground/50">
              <Sparkles size={12} />
              <span>Pro AI</span>
            </div>
            <button className="flex items-center gap-1 text-xs text-foreground/50 hover:text-foreground/70 transition-colors">
              <span>Cancel</span>
              <span className="text-[10px] px-1 py-0.5 rounded border border-foreground/20">ESC</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommandContent;
