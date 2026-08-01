import { BaseLogo } from "@/renderer/components/common/base-logo";
import { Markdown } from "@/renderer/components/common/markdown";
import type { UIMessage } from "@/renderer/types/chat";
import { getToolName, isToolUIPart } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { TOOL_COMPONENTS } from "../tools";
import type { ToolMessagePart } from "../tools/tool-part";
import MessageRow from "./message-row";
import ToolCall from "./tool-call";
import { WORKSPACE_TOOL_NAMES } from "@/shared/types/workspace-perception";
import { useMembers } from "@/renderer/libs/stores/member-store";
import { useAgent, useConversation } from "@/renderer/libs/db/hooks";
import { useSelectionStore } from "@/renderer/libs/db/ui-state";
import { resolveSenderName } from "@/renderer/libs/chat-labels";

interface ChatContentProps {
  messages: UIMessage[];
  /** Channels show reactions; 1:1 chats hide them. */
  showReactions?: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  onEditMessage: (message: UIMessage, newContent: string) => void;
  onRegenerateMessage: (message: UIMessage) => void;
  onReplyToMessage: (message: UIMessage) => void;
  onBranchFromMessage: (messageIndex: number) => void;
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
  onReplyToMessage,
  onBranchFromMessage,
  showReactions,
}: ChatContentProps) {
  const members = useMembers();
  const { currentConversationId } = useSelectionStore();
  const conversation = useConversation(currentConversationId);
  // Names assistant rows written before senderId existed.
  const boundAgent = useAgent(conversation?.agentId ?? null);
  const agentName = boundAgent?.name ?? null;
  const [previousMessageCount, setPreviousMessageCount] = useState(0);
  const [hasReceivedFirstToken, setHasReceivedFirstToken] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

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

  const handleRegenerateWithLoading = useCallback(
    (message: UIMessage) => {
      if (onRegenerateMessage) {
        setHasReceivedFirstToken(false);
        onRegenerateMessage(message);
      }
    },
    [onRegenerateMessage],
  );

  // Renders text content using Markdown
  const renderMessageContent = useCallback(
    (content: string, isStreaming?: boolean) => {
      if (!content) return null;
      return <Markdown isStreaming={isStreaming}>{content}</Markdown>;
    },
    [],
  );

  // Render tool calls with detailed information
  const renderToolCall = useCallback(
    (toolPart: ToolMessagePart, index: number) => {
      const toolName = getToolName(toolPart);
      const rendererName = toolName.includes(":")
        ? toolName.slice(toolName.lastIndexOf(":") + 1)
        : toolName;

      // How a colleague looks around and how it speaks are its own business —
      // a person's messages appear in the room, not their glance at the roster.
      // The message `send_message` posts shows up on its own.
      if (WORKSPACE_TOOL_NAMES.has(rendererName)) return null;

      // Check if there's a custom renderer for this tool
      const CustomRenderer =
        TOOL_COMPONENTS[rendererName as keyof typeof TOOL_COMPONENTS];
      if (CustomRenderer) {
        return (
          <CustomRenderer
            key={`tool-${toolPart.toolCallId || index}`}
            toolPart={toolPart}
          />
        );
      }

      return (
        <ToolCall
          key={`tool-${toolPart.toolCallId || index}`}
          toolPart={toolPart}
        />
      );
    },
    [],
  );

  // Renders tool calls and text content in order
  const renderToolCalls = useCallback(
    (message: UIMessage, isStreaming?: boolean) => {
      if (!message.parts)
        return renderMessageContent(message.content, isStreaming);

      const contentElements: React.ReactNode[] = [];

      // Iterate through all parts in the order they appear
      message.parts.forEach((part, index) => {
        if (part.type === "text" && "text" in part) {
          // Add text content
          contentElements.push(
            <div key={`text-${index}`} className="my-2">
              {renderMessageContent(part.text, isStreaming)}
            </div>,
          );
        } else if (isToolUIPart(part)) {
          contentElements.push(renderToolCall(part, index));
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
        <div className="w-full px-4">
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
                  {resolveSenderName({ isUser: false, agentName })}
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

  const updateScrollToBottom = useCallback(
    (instant: boolean = false) => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({
          behavior: instant ? "instant" : "smooth",
        });
      }
    },
    [messagesEndRef],
  );

  useEffect(() => {
    // First load (messages loaded from 0) should use instant scroll
    // New messages arriving should use smooth scroll
    const isFirstLoad = previousMessageCount === 0 && messages.length > 0;

    // Update the previous message count
    setPreviousMessageCount(messages.length);

    // When new messages come in, scroll to the bottom
    updateScrollToBottom(isFirstLoad);
  }, [messages.length, updateScrollToBottom, previousMessageCount]);

  // Function to render messages with our new ChatMessage component
  // Note: This hook must be called before any conditional returns
  const renderMessages = useCallback(() => {
    const membersById = new Map((members ?? []).map((m) => [m.id, m]));
    const messagesById = new Map(
      messages.map((message) => [message.id, message]),
    );

    return messages.map((message, index) => {
      const isLastMessage = index === messages.length - 1;
      const previous = index > 0 ? messages[index - 1] : undefined;
      // Without senderId, role is the identity — two consecutive assistant
      // rows are the same speaker, same as two consecutive user rows.
      const isGrouped =
        !message.replyToMessageId &&
        !!previous &&
        (message.senderId
          ? previous.senderId === message.senderId
          : !previous.senderId && previous.role === message.role);
      const isLastUserMessage = !!(
        lastUserMessage && message.id === lastUserMessage.id
      );
      const isEditing = editingMessageId === message.id;
      const isCopied = copiedMessageId === message.id ? true : false;
      const replyParent = message.replyToMessageId
        ? messagesById.get(message.replyToMessageId)
        : undefined;
      const replySender = replyParent?.senderId
        ? membersById.get(replyParent.senderId)
        : undefined;
      const replyTarget = replyParent
        ? {
            id: replyParent.id,
            senderName: resolveSenderName({
              senderName: replySender?.name,
              isUser: replyParent.role === "user",
              agentName,
            }),
            content:
              typeof replyParent.content === "string"
                ? replyParent.content
                : "",
          }
        : null;

      // Prepare the correct content based on message type
      // For assistant messages, check if this is the last message and is currently streaming
      const isMessageStreaming =
        isLoading && isLastMessage && message.role === "assistant";
      let content: React.ReactNode;
      if (message.role === "assistant") {
        content = renderToolCalls(message, isMessageStreaming);
      } else {
        content = message.content
          ? renderMessageContent(message.content)
          : null;
      }

      return (
        <MessageRow
          key={message.id}
          showReactions={showReactions ?? false}
          message={message}
          messageIndex={index}
          sender={
            message.senderId ? membersById.get(message.senderId) : undefined
          }
          agentName={agentName}
          isGrouped={isGrouped}
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
          onRegenerate={() => handleRegenerateWithLoading(message)}
          onReply={() => onReplyToMessage(message)}
          onBranch={onBranchFromMessage}
          replyTarget={replyTarget}
          onOpenReplyTarget={() => {
            if (!replyTarget) return;
            const target = document.querySelector<HTMLElement>(
              `[data-message-id="${CSS.escape(replyTarget.id)}"]`,
            );
            target?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          renderContent={content}
        />
      );
    });
  }, [
    messages,
    members,
    agentName,
    lastUserMessage,
    editingMessageId,
    editedContent,
    copiedMessageId,
    handleEditStart,
    handleEditSave,
    handleEditCancel,
    handleCopyContent,
    handleRegenerateWithLoading,
    onBranchFromMessage,
    onReplyToMessage,
    renderToolCalls,
    renderMessageContent,
    isLoading,
  ]);

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
