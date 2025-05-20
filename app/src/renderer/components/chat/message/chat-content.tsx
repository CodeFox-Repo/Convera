import { UIMessage } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2 } from "lucide-react";
import React, { memo, useCallback, useEffect, useState } from "react";
import ChatMessage from "./chat-message";
import CopiedContentBlock from "./copied-content-block";
import ModifiedContentBlock from "./modified-content-block";
import ToolCall from "./tool-call";

/**
 * Simple markdown renderer component
 */
const Markdown = memo(({ children }: { children: string }) => {
  // Simple markdown rendering
  const formattedText = children
    .replace(
      /```([\s\S]*?)```/g,
      "<pre class='bg-foreground/10 p-3 rounded-md my-2 overflow-x-auto'><code>$1</code></pre>",
    )
    .replace(
      /`([^`]+)`/g,
      "<code class='bg-foreground/10 px-1 py-0.5 rounded text-xs'>$1</code>",
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br />");

  return (
    <div
      className="markdown no-drag-region"
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

  // Renders regenerating indicator
  function renderLoadingIndicator() {
    return (
      <div className="border-foreground/10 bg-foreground/5 no-drag-region flex items-center gap-2 rounded-md border px-3 py-1.5">
        <Loader2 className="text-foreground h-3 w-3 animate-spin" />
        <span className="text-foreground">
          {hasReceivedFirstToken ? "Generating response..." : "Loading..."}
        </span>
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
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <Bot className="h-8 w-8 text-zinc-500" />
          </div>
          <h3 className="mb-2 text-xl font-semibold">Welcome to FoxChat</h3>
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
    <div className="drag-region h-full flex-1 overflow-y-auto p-4 pt-10">
      <div className="no-drag-region flex h-full flex-col">
        {renderMessages()}

        {/* Show waiting for first token animation */}
        <AnimatePresence mode="wait">
          {isLoading && messages.length > 0 && (
            <motion.div
              key="waiting-first-token"
              className="no-drag-region flex w-full"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mx-auto w-full max-w-3xl">
                <div className="flex justify-start">
                  <div className="max-w-[80%] overflow-hidden text-sm">
                    <div className="rounded-[var(--app-border-radius)] bg-transparent">
                      {renderLoadingIndicator()}
                    </div>
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
