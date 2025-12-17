import { BaseLogo } from "@/renderer/components/common/base-logo";
import { UIMessage } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import React, { memo, useCallback, useEffect, useState } from "react";
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
import { SelectedContent } from "@/renderer/libs/stores/chat-store";
import "katex/dist/katex.min.css";
import ModifiedContentBlock from "../selected/modified-content-block";
import ChatMessage from "./chat-message";
import ToolCall from "./tool-call";

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

/**
 * Type definitions for tool invocations
 */
interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  state: string;
  args?: Record<string, unknown>;
  result?: string | { message?: string; [key: string]: unknown };
}

interface ToolPart {
  type: "tool-invocation";
  toolInvocation: ToolInvocation;
}

interface ChatContentProps {
  messages: UIMessage[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  onEditMessage: (message: UIMessage, newContent: string) => void;
  onRegenerateMessage: () => void;
  agentChanged?: boolean;
  onRegenerateWithNewAgent?: () => void;
  onIgnoreAgentChange?: () => void;
}

/**
 * Component to display chat messages including tool invocations
 */
export default function ChatContent({
  messages,
  messagesEndRef,
  isLoading,
  onEditMessage,
  onRegenerateMessage,
}: ChatContentProps) {
  const [previousMessageCount, setPreviousMessageCount] = useState(0);
  const [hasReceivedFirstToken, setHasReceivedFirstToken] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [modifiedResponses, setModifiedResponses] = useState<
    Record<string, "accepted" | "rejected" | null>
  >({});

  // Track message changes to animate new messages
  useEffect(() => {
    if (messages.length > previousMessageCount) {
      const timeout = setTimeout(() => {}, 1000);
      return () => clearTimeout(timeout);
    }
    setPreviousMessageCount(messages.length);
  }, [messages.length, previousMessageCount]);

  useEffect(() => {
    if (!isLoading) {
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        setHasReceivedFirstToken(
          lastMessage.role === "assistant" &&
            !!(
              (lastMessage.content && lastMessage.content.length > 0) ||
              (lastMessage.parts && lastMessage.parts.length > 0)
            ),
        );
      } else {
        setHasReceivedFirstToken(false);
      }
    }
  }, [isLoading, messages]);

  // Memoized event handlers
  const handleEditStart = useCallback((message: UIMessage) => {
    setEditingMessageId(message.id);
    setEditedContent(message.content || "");
  }, []);

  const handleEditSave = useCallback(
    (message: UIMessage) => {
      if (onEditMessage && editedContent.trim()) {
        onEditMessage(message, editedContent);
      }
      setEditingMessageId(null);
    },
    [onEditMessage, editedContent],
  );

  const handleEditCancel = useCallback(() => {
    setEditingMessageId(null);
    setEditedContent("");
  }, []);

  const handleCopyContent = useCallback(
    (content: string, messageId: string) => {
      navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopiedMessageId(null);
      }, 2000);
    },
    [],
  );

  const handleRegenerateWithLoading = useCallback(() => {
    if (onRegenerateMessage) {
      setHasReceivedFirstToken(false);
      onRegenerateMessage();
    }
  }, [onRegenerateMessage]);

  const handleAcceptModification = useCallback((messageId: string) => {
    setModifiedResponses((prev) => ({
      ...prev,
      [messageId]: "accepted",
    }));
    // Here you could implement logic to apply the modifications
    console.log(`Accepted modification for message ${messageId}`);
  }, []);

  // Extract selected content from message content
  const extractSelectedContent = useCallback((content: string) => {
    if (!content) return { selectedContent: null, cleanContent: content };

    const selectedContentPattern = /<selected>\n([\s\S]*?)\n<\/selected>/;
    const selectedContentMatch = content.match(selectedContentPattern);

    if (selectedContentMatch) {
      const selectedContent = selectedContentMatch[1];
      const cleanContent = content.replace(selectedContentPattern, "").trim();
      return { selectedContent, cleanContent };
    }

    return { selectedContent: null, cleanContent: content };
  }, []);

  // Renders text content using Markdown
  const renderMessageContent = useCallback(
    (content: string, messageId: string) => {
      if (!content) return null;

      // Define regex patterns for special content blocks (excluding copied content)
      const modifiedContentPattern = /<modified>\n([\s\S]*?)\n<\/modified>/;

      // Extract special content
      const modifiedContentMatch = content.match(modifiedContentPattern);

      // Check if this message's modified content has already been responded to
      const modificationResponse = modifiedResponses[messageId];

      // Clean the content by removing special blocks
      let cleanContent = content;
      if (modifiedContentMatch) {
        cleanContent = cleanContent.replace(modifiedContentPattern, "");
      }
      cleanContent = cleanContent.trim();

      // Render content sections in order
      const contentSections: React.ReactNode[] = [];

      // Add main content if it exists
      if (cleanContent) {
        contentSections.push(
          <Markdown key="main-content">{cleanContent}</Markdown>,
        );
      }

      // Add modified content block if it exists and hasn't been rejected
      if (modifiedContentMatch && modificationResponse !== "rejected") {
        const modifiedContent = modifiedContentMatch[1];
        contentSections.push(
          <ModifiedContentBlock
            key="modified-content"
            modifiedContent={modifiedContent}
            onAccept={() => handleAcceptModification(messageId)}
          >
            <Markdown>{modifiedContent}</Markdown>
          </ModifiedContentBlock>,
        );
      }

      // Return all sections or fallback to original content
      return contentSections.length > 0 ? (
        <>{contentSections}</>
      ) : (
        <Markdown>{content}</Markdown>
      );
    },
    [modifiedResponses, handleAcceptModification],
  );

  // Render tool calls with detailed information
  const renderToolCall = useCallback((part: ToolPart, index: number) => {
    if (!part.toolInvocation) return null;

    const toolInvocation = part.toolInvocation;
    const toolName = toolInvocation.toolName || "Tool";
    const args = toolInvocation.args || {};
    let result = "Pending result...";

    if (toolInvocation.result) {
      if (typeof toolInvocation.result === "string") {
        result = toolInvocation.result;
      } else if (typeof toolInvocation.result === "object") {
        // Try to extract message from result object if it exists
        if (toolInvocation.result.message) {
          result = toolInvocation.result.message as string;
        } else {
          result = JSON.stringify(toolInvocation.result, null, 2);
        }
      }
    }

    const isCompleted =
      toolInvocation.state === "complete" ||
      toolInvocation.state === "result" ||
      !!toolInvocation.result;

    return (
      <ToolCall
        key={`tool-${toolInvocation.toolCallId || index}`}
        tool={toolName}
        args={args}
        result={result}
        isCompleted={isCompleted}
      />
    );
  }, []);

  // Renders tool calls and text content in order
  const renderToolCalls = useCallback(
    (message: UIMessage) => {
      if (!message.parts)
        return renderMessageContent(message.content, message.id);

      const contentElements: React.ReactNode[] = [];

      // Iterate through all parts in the order they appear
      message.parts.forEach((part, index) => {
        if (part.type === "text" && "text" in part) {
          // Add text content
          contentElements.push(
            <div key={`text-${index}`} className="my-2">
              {renderMessageContent(part.text, message.id)}
            </div>,
          );
        } else if (
          part.type === "tool-invocation" &&
          "toolInvocation" in part
        ) {
          contentElements.push(renderToolCall(part as ToolPart, index));
        }
      });

      return <>{contentElements}</>;
    },
    [renderMessageContent, renderToolCall],
  );

  // Renders regenerating indicator
  function renderLoadingIndicator() {
    return (
      <div className="w-full py-2">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex gap-3">
            {/* Avatar section */}
            <div className="flex-shrink-0">
              <div className="size-9 rounded-full overflow-hidden bg-muted flex items-center justify-center ring-1 ring-border/40">
                <BaseLogo size={24} />
              </div>
            </div>

            {/* Content section */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* Header with role and timestamp - inline with avatar */}
              <div className="flex items-center gap-3 -mt-0.5">
                <span className="text-sm font-semibold text-foreground">
                  Convera
                </span>
                <span className="text-xs text-muted-foreground/80">Now</span>
              </div>

              {/* Loading content */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {hasReceivedFirstToken
                    ? "Generating response..."
                    : "Loading..."}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Get the last user message for edit button
  const lastUserMessageIndex = [...messages]
    .reverse()
    .findIndex((msg) => msg.role === "user");
  const lastUserMessage =
    lastUserMessageIndex !== -1
      ? messages[messages.length - 1 - lastUserMessageIndex]
      : null;

  const updateScrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    // Update the previous message count
    setPreviousMessageCount(messages.length);

    // When new messages come in, scroll to the bottom
    updateScrollToBottom();
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="drag-region flex h-full w-full items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="no-drag-region flex max-w-md flex-col items-center p-6 text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center">
            <BaseLogo size={64} />
          </div>
          <h3 className="mb-2 text-xl font-semibold">Welcome to Convera</h3>
          <p className="text-zinc-500 dark:text-zinc-400">
            Ask me anything about coding, tech, or problems you&apos;re facing
            with your projects.
          </p>
        </motion.div>
      </div>
    );
  }

  // Function to render messages with our new ChatMessage component
  const renderMessages = useCallback(() => {
    return messages.map((message, index) => {
      const isLastMessage = index === messages.length - 1;
      const isLastUserMessage = !!(
        lastUserMessage && message.id === lastUserMessage.id
      );
      const isEditing = editingMessageId === message.id;
      const isCopied = copiedMessageId === message.id ? true : false;

      // Extract selected content for user messages
      let selectedContent: SelectedContent | null = null;
      let contentToRender = message.content;

      if (message.role === "user" && message.content) {
        const { selectedContent: extracted, cleanContent } =
          extractSelectedContent(message.content);
        // Convert extracted string to SelectedContent object for backward compatibility
        selectedContent = extracted
          ? { text: extracted, source: "manual" }
          : null;
        contentToRender = cleanContent;
      }

      // Prepare the correct content based on message type
      let content: React.ReactNode;
      if (message.role === "assistant") {
        content = renderToolCalls(message);
      } else {
        content = contentToRender
          ? renderMessageContent(contentToRender, message.id)
          : null;
      }

      return (
        <ChatMessage
          key={message.id}
          message={message}
          isLastMessage={isLastMessage}
          isLastUserMessage={isLastUserMessage}
          isEditing={isEditing}
          editedContent={editedContent}
          isCopied={isCopied}
          selectedContent={selectedContent}
          onEditStart={() => handleEditStart(message)}
          onEditSave={() => handleEditSave(message)}
          onEditCancel={handleEditCancel}
          onEditContentChange={setEditedContent}
          onCopy={() => handleCopyContent(message.content || "", message.id)}
          onRegenerate={handleRegenerateWithLoading}
          renderContent={content}
        />
      );
    });
  }, [
    messages,
    lastUserMessage,
    editingMessageId,
    editedContent,
    copiedMessageId,
    extractSelectedContent,
    handleEditStart,
    handleEditSave,
    handleEditCancel,
    handleCopyContent,
    handleRegenerateWithLoading,
    renderToolCalls,
    renderMessageContent,
  ]);

  return (
    <div className="drag-region h-full flex-1 overflow-y-auto">
      <div className="no-drag-region flex h-full flex-col">
        {renderMessages()}

        {/* Show waiting for first token animation - only if last message is not from assistant */}
        <AnimatePresence mode="wait">
          {isLoading &&
            messages.length > 0 &&
            !(messages[messages.length - 1]?.role === "assistant") && (
              <motion.div
                key="waiting-first-token"
                className="no-drag-region w-full"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {renderLoadingIndicator()}
              </motion.div>
            )}
        </AnimatePresence>

        <div ref={messagesEndRef} className="h-8" />
      </div>
    </div>
  );
}
