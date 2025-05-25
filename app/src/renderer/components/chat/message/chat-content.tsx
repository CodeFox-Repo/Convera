import { UIMessage } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2 } from "lucide-react";
import React, { memo, useCallback, useEffect, useState } from "react";
import CopiedContentBlock from "../clipboard/copied-content-block";
import ModifiedContentBlock from "../clipboard/modified-content-block";
import ChatMessage from "./chat-message";
import ToolCall from "./tool-call";

/**
 * Simple markdown renderer component with improved styling
 */
const Markdown = memo(({ children }: { children: string }) => {
  // Enhanced markdown rendering with better styling
  const formattedText = children
    .replace(
      /```([\s\S]*?)```/g,
      "<pre class='bg-black/5 dark:bg-white/5 p-4 rounded-xl my-3 overflow-x-auto border border-black/10 dark:border-white/10 backdrop-blur-sm'><code class='text-sm font-mono'>$1</code></pre>",
    )
    .replace(
      /`([^`]+)`/g,
      "<code class='bg-orange-100/80 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 px-2 py-1 rounded-md text-sm font-mono border border-orange-200/50 dark:border-orange-800/50'>$1</code>",
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong class='font-semibold text-gray-900 dark:text-white'>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em class='italic text-gray-700 dark:text-gray-300'>$1</em>")
    .replace(/\n/g, "<br />");

  return (
    <div
      className="markdown no-drag-region prose prose-sm dark:prose-invert leading-relaxed"
      dangerouslySetInnerHTML={{ __html: formattedText }}
    />
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

  // Renders text content using Markdown
  const renderMessageContent = useCallback(
    (content: string, messageId: string) => {
      if (!content) return null;

      // Check for copied content tags
      const copiedContentMatch = content.match(
        /<copied>\n([\s\S]*?)\n<\/copied>/,
      );

      // Check for modified content tags
      const modifiedContentMatch = content.match(
        /<modified>\n([\s\S]*?)\n<\/modified>/,
      );

      // Check if this message's modified content has already been responded to
      const modificationResponse = modifiedResponses[messageId];

      if (copiedContentMatch && modifiedContentMatch) {
        // Both copied and modified content exist
        const copiedContent = copiedContentMatch[1];
        const modifiedContent = modifiedContentMatch[1];

        // Remove both blocks from the original content
        const otherContent = content
          .replace(/<copied>\n[\s\S]*?\n<\/copied>/, "")
          .replace(/<modified>\n[\s\S]*?\n<\/modified>/, "")
          .trim();

        // Return a fragment with all three sections
        return (
          <>
            {otherContent && <Markdown>{otherContent}</Markdown>}
            <CopiedContentBlock>
              <Markdown>{copiedContent}</Markdown>
            </CopiedContentBlock>
            {modificationResponse !== "rejected" && (
              <ModifiedContentBlock
                modifiedContent={modifiedContent}
                onAccept={() => handleAcceptModification(messageId)}
                // onReject={() => handleRejectModification(messageId)} (TODO ALLEN: Implement this)
              >
                <Markdown>{modifiedContent}</Markdown>
              </ModifiedContentBlock>
            )}
          </>
        );
      } else if (copiedContentMatch) {
        // Only copied content exists
        const copiedContent = copiedContentMatch[1];

        // Remove the copied block from the original content
        const otherContent = content
          .replace(/<copied>\n[\s\S]*?\n<\/copied>/, "")
          .trim();

        // Return a fragment with copied content block and regular markdown
        return (
          <>
            {otherContent && <Markdown>{otherContent}</Markdown>}
            <CopiedContentBlock>
              <Markdown>{copiedContent}</Markdown>
            </CopiedContentBlock>
          </>
        );
      } else if (modifiedContentMatch && modificationResponse !== "rejected") {
        // Only modified content exists and hasn't been rejected
        const modifiedContent = modifiedContentMatch[1];

        // Remove the modified block from the original content
        const otherContent = content
          .replace(/<modified>\n[\s\S]*?\n<\/modified>/, "")
          .trim();

        // Return a fragment with modified content block and regular markdown
        return (
          <>
            {otherContent && <Markdown>{otherContent}</Markdown>}
            <ModifiedContentBlock
              modifiedContent={modifiedContent}
              onAccept={() => handleAcceptModification(messageId)}
            >
              <Markdown>{modifiedContent}</Markdown>
            </ModifiedContentBlock>
          </>
        );
      }

      // If no special content, just render as normal markdown
      return <Markdown>{content}</Markdown>;
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

  // Renders regenerating indicator with enhanced visual interest
  function renderLoadingIndicator() {
    return (
      <div className="no-drag-region flex items-center gap-3 rounded-2xl border border-orange-200/15 dark:border-orange-800/15 bg-gradient-to-r from-orange-50/25 via-amber-50/20 to-yellow-50/15 dark:from-orange-900/8 dark:via-amber-900/6 dark:to-yellow-900/4 backdrop-blur-2xl px-4 py-3 hover:from-orange-50/35 hover:via-amber-50/30 hover:to-yellow-50/25 dark:hover:from-orange-900/12 dark:hover:via-amber-900/10 dark:hover:to-yellow-900/8 transition-all duration-300">
        <Loader2 className="h-4 w-4 animate-spin text-orange-600 dark:text-orange-400" />
        <span className="text-gray-700 dark:text-gray-300 font-medium">
          {hasReceivedFirstToken ? "Generating response..." : "Loading..."}
        </span>
        <div className="ml-2 flex gap-1">
          <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" />
          <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
          <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
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
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="no-drag-region flex max-w-md flex-col items-center p-8 text-center"
        >
          {/* Enhanced welcome design */}
          <motion.div 
            className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900/30 dark:to-orange-800/30 border border-orange-200/50 dark:border-orange-800/50"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5, type: "spring" }}
          >
            <Bot className="h-10 w-10 text-orange-600 dark:text-orange-400" />
          </motion.div>
          
          <motion.h3 
            className="mb-3 text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            Welcome to FoxyChat
          </motion.h3>
          
          {/* <motion.p 
            className="text-gray-600 dark:text-gray-400 leading-relaxed max-w-sm"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            I'm your intelligent AI assistant, ready to help you with coding, creative projects, and problem-solving. What would you like to explore today?
          </motion.p> */}
          
          {/* Animated suggestion chips with enhanced visual interest */}
          <motion.div 
            className="mt-6 flex flex-wrap gap-2 justify-center"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            {["Code Review", "Creative Writing", "Problem Solving"].map((suggestion, index) => (
              <motion.div
                key={suggestion}
                className="px-3 py-1.5 bg-gradient-to-r from-white/30 via-white/25 to-white/20 dark:from-black/12 dark:via-black/10 dark:to-black/8 backdrop-blur-2xl rounded-full text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200/20 dark:border-gray-700/20 hover:from-white/40 hover:via-white/35 hover:to-white/30 dark:hover:from-black/18 dark:hover:via-black/15 dark:hover:to-black/12 cursor-pointer transition-all duration-200"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                {suggestion}
              </motion.div>
            ))}
          </motion.div>
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

      // Prepare the correct content based on message type
      let content: React.ReactNode;
      if (message.role === "assistant") {
        content = renderToolCalls(message);
      } else {
        content = message.content
          ? renderMessageContent(message.content, message.id)
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
    handleEditStart,
    handleEditSave,
    handleEditCancel,
    handleCopyContent,
    handleRegenerateWithLoading,
    renderToolCalls,
    renderMessageContent,
  ]);

  return (
    <div className="h-full flex-1 overflow-y-auto px-6 py-8">
      <div className="no-drag-region flex h-full flex-col space-y-6 max-w-4xl mx-auto">
        {renderMessages()}

        {/* Show waiting for first token animation with improved styling */}
        <AnimatePresence mode="wait">
          {isLoading && messages.length > 0 && (
            <motion.div
              key="waiting-first-token"
              className="no-drag-region flex w-full"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <div className="w-full">
                <div className="flex justify-start">
                  <div className="max-w-[80%] overflow-hidden">
                    {renderLoadingIndicator()}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} className="h-4" />
      </div>
    </div>
  );
}
