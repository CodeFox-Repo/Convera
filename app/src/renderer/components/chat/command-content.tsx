// Command Content Component
// Displays MCP command results and AI chat responses in a larger content area
import { useCommands } from "@/renderer/libs/hooks/use-commands";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { Bot, Loader2, Sparkles } from "lucide-react";
import React, { memo, useCallback, useEffect, useRef } from "react";
import { Markdown } from "../common/markdown";
import { TOOL_COMPONENTS } from "./tools";
import {
  MessageContentRendererProps,
  MessagePart,
  MessagePartRendererProps,
  ToolCallRendererProps,
  UIMessage,
  isTextPart,
  isToolInvocationPart,
} from "./types";
/**
 * Component for rendering tool calls with styled output
 */
const ToolCallRenderer = memo(({ toolInvocation }: ToolCallRendererProps) => {
  if (!toolInvocation) return null;

  const toolName = toolInvocation.toolName || "Tool";

  const SpecialComponent =
    TOOL_COMPONENTS[toolName as keyof typeof TOOL_COMPONENTS];
  if (SpecialComponent) {
    return <SpecialComponent toolInvocation={toolInvocation} />;
  }

  // Default renderer
  let result = "Pending result...";
  let isCompleted = false;

  // Check if the tool invocation has a result (AI SDK structure)
  if (toolInvocation.state === "result" && "result" in toolInvocation) {
    isCompleted = true;
    const toolResult = toolInvocation.result;

    if (typeof toolResult === "string") {
      result = toolResult;
    } else if (typeof toolResult === "object") {
      // Try to extract message from result object if it exists
      if (toolResult.message) {
        result = toolResult.message as string;
      } else {
        result = JSON.stringify(toolResult, null, 2);
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Tool Call */}
      <div className="flex items-center gap-2 text-xs text-foreground/60 font-medium">
        <span>I&apos;ll use {toolName}</span>
        {!isCompleted && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>

      {/* Tool Result */}
      {isCompleted && (
        <div className="space-y-1">
          <div className="text-xs text-foreground/60 font-medium">I got:</div>
          <div className="text-sm text-foreground pl-4">
            {typeof result === "string" ? (
              <Markdown>{result}</Markdown>
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/70">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

ToolCallRenderer.displayName = "ToolCallRenderer";

/**
 * Component for rendering individual message parts
 */
const MessagePartRenderer = memo(
  ({ part, index }: MessagePartRendererProps) => {
    if (isTextPart(part)) {
      return (
        <div key={`text-${index}`} className="my-2">
          <Markdown>{part.text}</Markdown>
        </div>
      );
    }

    if (isToolInvocationPart(part)) {
      return (
        <ToolCallRenderer
          key={`tool-${index}`}
          toolInvocation={part.toolInvocation}
          index={index}
        />
      );
    }

    return null;
  },
);

MessagePartRenderer.displayName = "MessagePartRenderer";

/**
 * Component for rendering complete message content based on UIMessage structure
 */
const MessageContentRenderer = memo(
  ({
    message,
    findCommandContent,
  }: MessageContentRendererProps & {
    findCommandContent?: (commandName: string) => string;
  }) => {
    // Process CdFx content function
    const processCdFxContent = (text: string) => {
      const cdfxTagRegex = /<([^>\s]*cdfx[^>\s]*)[^>]*>([\s\S]*?)<\/\1>/gi;
      const matches = [...text.matchAll(cdfxTagRegex)];

      if (matches.length > 0) {
        const firstMatch = matches[0];
        const fullTagName = firstMatch[1];
        const xmlContent = firstMatch[2].trim();
        const fullXmlTag = firstMatch[0];
        const cleanTagName = fullTagName.replace(/cdfx/gi, "").trim();

        const remainingContent = text.replace(fullXmlTag, "").trim();

        return {
          hasCommand: true,
          commandContent: xmlContent,
          commandName: cleanTagName || "Command",
          remainingContent: remainingContent,
        };
      }

      return {
        hasCommand: false,
        commandContent: "",
        commandName: "",
        remainingContent: text,
      };
    };

    // If message has parts, render each part
    if (message.parts && message.parts.length > 0) {
      return (
        <div className="space-y-2">
          {message.parts.map((part, index) => {
            // Process text parts for CdFx content
            if (isTextPart(part)) {
              const { hasCommand, commandName, remainingContent } =
                processCdFxContent(part.text);

              return (
                <div key={`part-${index}`} className="my-2">
                  {/* Show command execution if CdFx content exists */}
                  {hasCommand && findCommandContent && (
                    <div>{findCommandContent(commandName)}</div>
                  )}

                  {/* Render remaining content */}
                  {remainingContent && <Markdown>{remainingContent}</Markdown>}
                </div>
              );
            }

            // For non-text parts, use original renderer
            return (
              <MessagePartRenderer
                key={`part-${index}`}
                part={part as MessagePart}
                index={index}
              />
            );
          })}
        </div>
      );
    }

    // Fallback to rendering content as text with CdFx processing
    if (message.content) {
      const { hasCommand, commandName, remainingContent } = processCdFxContent(
        message.content,
      );

      return (
        <div>
          {/* Show command execution if CdFx content exists */}
          {hasCommand && findCommandContent && (
            <div>{findCommandContent(commandName)}</div>
          )}

          {/* Render remaining content */}
          {remainingContent && <Markdown>{remainingContent}</Markdown>}
        </div>
      );
    }

    return null;
  },
);

MessageContentRenderer.displayName = "MessageContentRenderer";

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
  const { messages, isLoading, currentConversationId, contextLoading } =
    useChatContext();
  const { findCommandContent } = useCommands();
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

  // Render message content using the new structured approach
  const renderMessageContent = useCallback(
    (message: UIMessage) => {
      return (
        <MessageContentRenderer
          message={message}
          findCommandContent={findCommandContent}
        />
      );
    },
    [findCommandContent],
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
            <div className="flex items-center justify-center gap-2 mb-2">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <div className="text-sm">On Loading</div>
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
                        {renderMessageContent(pair.user)}
                      </div>

                      {/* Assistant message (if exists) */}
                      {pair.assistant && (
                        <div className="text-foreground leading-relaxed">
                          {renderMessageContent(pair.assistant)}
                        </div>
                      )}

                      {/* Loading indicator inside card when AI is thinking */}
                      {isLastPair &&
                        (isLoading || contextLoading) &&
                        !pair.assistant && (
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
                            if (
                              currentConversationId &&
                              window.electronAPI?.toggleWindow
                            ) {
                              // Pass conversation ID to main window via localStorage
                              localStorage.setItem(
                                "switchToConversation",
                                currentConversationId,
                              );

                              // Trigger storage event for same-window detection
                              window.dispatchEvent(
                                new StorageEvent("storage", {
                                  key: "switchToConversation",
                                  newValue: currentConversationId,
                                  oldValue: null,
                                }),
                              );

                              // Hide current chat window and show main window
                              window.electronAPI.toggleWindow("chat"); // Hide chat
                              window.electronAPI.toggleWindow("main"); // Show main
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
              <span className="text-[10px] px-1 py-0.5 rounded border border-foreground/20">
                ESC
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommandContent;
