import { Attachment, UIMessage } from "ai";
import { motion } from "framer-motion";
import { Check, Copy, Edit, File, RefreshCw, User } from "lucide-react";
import React, { memo } from "react";

/**
 * Individual chat message component props
 */
export interface ChatMessageProps {
  message: UIMessage;
  isLastMessage: boolean;
  isLastUserMessage: boolean;
  isEditing: boolean;
  editedContent: string;
  isCopied: boolean;
  onEditStart: () => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onEditContentChange: (content: string) => void;
  onCopy: () => void;
  onRegenerate: () => void;
  renderContent: React.ReactNode;
}

const avatar = "../../images/icon.png";

// Attachment preview component - simplified for file display above content
const AttachmentPreview = ({ attachment }: { attachment: Attachment }) => {
  const isImage = attachment.contentType?.startsWith("image/");
  return (
    <div className="group relative flex items-center gap-2 p-2 rounded-md border border-border bg-background/50 text-sm">
      {isImage ? (
        <div className="size-8 flex-shrink-0 rounded overflow-hidden">
          <img src={attachment.url} alt="" className="size-full object-cover" />
        </div>
      ) : (
        <File size={16} className="flex-shrink-0 text-muted-foreground" />
      )}
      <div className="flex-1 min-w-0">
        <span className="block truncate font-medium text-foreground">
          {attachment.name}
        </span>
        {attachment.contentType && (
          <span className="text-xs text-muted-foreground">
            {attachment.contentType}
          </span>
        )}
      </div>
    </div>
  );
};

// Simple timestamp formatter
const formatTimestamp = (timestamp?: string | number | Date) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 1) return "Now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
};

/**
 * Individual chat message component for displaying messages with unified left alignment
 */
const ChatMessage = memo(
  ({
    message,
    isLastMessage,
    isLastUserMessage,
    isEditing,
    editedContent,
    isCopied,
    onEditStart,
    onEditSave,
    onEditCancel,
    onEditContentChange,
    onCopy,
    onRegenerate,
    renderContent,
  }: ChatMessageProps) => {
    const isUser = message.role === "user";
    const hasAttachments =
      message.experimental_attachments &&
      message.experimental_attachments.length > 0;

    return (
      <motion.div
        className="group/message no-drag-region w-full py-4 border-b border-border/30 last:border-b-0"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="max-w-4xl mx-auto px-4">
          {/* Unified left-aligned layout for all messages */}
          <div className="flex gap-4">
            {/* Avatar section */}
            <div className="flex-shrink-0 mt-1">
              <div className="size-8 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                {isUser ? (
                  <User size={16} className="text-muted-foreground" />
                ) : (
                  <img
                    src={avatar}
                    alt="Agent"
                    className="size-6 object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                      const parent = target.parentElement!;
                      parent.innerHTML = "";
                      const botIcon = document.createElement("div");
                      botIcon.innerHTML =
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H9V3H15V9H21ZM7 24H17V14H7V24ZM9 16H15V22H9V16Z" fill="currentColor"/></svg>';
                      botIcon.className = "text-muted-foreground";
                      parent.appendChild(botIcon);
                    }}
                  />
                )}
              </div>
            </div>

            {/* Content section */}
            <div className="flex-1 min-w-0">
              {/* Header with role and timestamp */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-foreground">
                  {isUser ? "You" : "FoxyChat"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(message.createdAt)}
                </span>
              </div>

              {/* Attachments section - above content */}
              {hasAttachments && (
                <div className="mb-3 space-y-2">
                  {message.experimental_attachments?.map(
                    (attachment, index) => (
                      <AttachmentPreview key={index} attachment={attachment} />
                    ),
                  )}
                </div>
              )}

              {/* Message content */}
              <div className="text-foreground text-sm leading-relaxed">
                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      className="w-full min-h-[100px] p-3 rounded-md border border-border bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                      value={editedContent}
                      onChange={(e) => onEditContentChange(e.target.value)}
                      autoFocus
                      placeholder="Edit your message..."
                    />
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1.5 text-sm rounded-md bg-background border border-border text-muted-foreground hover:text-foreground transition-colors"
                        onClick={onEditCancel}
                      >
                        Cancel
                      </button>
                      <button
                        className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        onClick={onEditSave}
                      >
                        Save & Regenerate
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    {message.content || message.parts ? (
                      renderContent
                    ) : (
                      <div className="text-muted-foreground italic">
                        {isUser ? "Empty message" : "..."}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {(message.content || message.parts || hasAttachments) &&
                !isEditing && (
                  <div className="mt-3 flex items-center gap-2">
                    <div
                      className={`flex items-center gap-1 transition-opacity duration-200 ${
                        isLastMessage
                          ? "opacity-100"
                          : "opacity-0 group-hover/message:opacity-100"
                      }`}
                    >
                      <button
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        onClick={onCopy}
                        title={isCopied ? "Copied!" : "Copy to clipboard"}
                      >
                        {isCopied ? <Check size={14} /> : <Copy size={14} />}
                      </button>

                      {isUser && isLastUserMessage && (
                        <button
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          onClick={onEditStart}
                          title="Edit message"
                        >
                          <Edit size={14} />
                        </button>
                      )}

                      {!isUser && isLastMessage && (
                        <button
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          onClick={onRegenerate}
                          title="Regenerate response"
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  },
);

ChatMessage.displayName = "ChatMessage";

export default ChatMessage;
