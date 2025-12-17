import { BaseLogo } from "@/renderer/components/common/base-logo";
import { authClient } from "@/renderer/libs/auth-client";
import { SelectedContent } from "@/renderer/libs/stores/chat-store";
import { Attachment, UIMessage } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Edit, File, RefreshCw, User } from "lucide-react";
import React, { memo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import SelectedContentBlock from "../selected/selected-content-block";

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
 * Individual chat message component props
 */
export interface ChatMessageProps {
  message: UIMessage;
  isLastMessage: boolean;
  isLastUserMessage: boolean;
  isEditing: boolean;
  editedContent: string;
  isCopied: boolean;
  selectedContent?: SelectedContent | null;
  onEditStart: () => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onEditContentChange: (content: string) => void;
  onCopy: () => void;
  onRegenerate: () => void;
  renderContent: React.ReactNode;
}

// Attachment preview component - simplified for file display above content
const AttachmentPreview = ({ attachment }: { attachment: Attachment }) => {
  const isImage = attachment.contentType?.startsWith("image/");
  const [showPreview, setShowPreview] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);
  const [imageRect, setImageRect] = useState<DOMRect | null>(null);

  const handleMouseEnter = () => {
    if (imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      setImageRect(rect);
    }
    setShowPreview(true);
  };

  const handleMouseLeave = () => {
    setShowPreview(false);
  };

  // Calculate preview position to avoid screen edges
  const getPreviewStyle = () => {
    if (!imageRect) return {};

    const previewWidth = 320;
    const previewHeight = 280;
    const padding = 16;

    let left = imageRect.left;
    let top = imageRect.bottom + 8;

    // Adjust if preview goes beyond right edge
    if (left + previewWidth > window.innerWidth - padding) {
      left = window.innerWidth - previewWidth - padding;
    }

    // Adjust if preview goes beyond bottom edge
    if (top + previewHeight > window.innerHeight - padding) {
      top = imageRect.top - previewHeight - 8;
    }

    // Ensure preview doesn't go beyond left edge
    if (left < padding) {
      left = padding;
    }

    return { left: `${left}px`, top: `${top}px` };
  };

  return (
    <div className="group relative flex items-center gap-2 p-2 rounded-md border border-border bg-background/50 text-sm">
      {isImage ? (
        <div
          ref={imageRef}
          className="size-8 flex-shrink-0 rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <img src={attachment.url} alt="" className="size-full object-cover" />

          {/* Preview overlay with expanding animation */}
          <AnimatePresence>
            {showPreview && imageRect && (
              <motion.div
                initial={{
                  scale: 0.1,
                  opacity: 0,
                }}
                animate={{
                  scale: 1,
                  opacity: 1,
                }}
                exit={{
                  scale: 0.1,
                  opacity: 0,
                }}
                transition={{
                  type: "spring",
                  damping: 20,
                  stiffness: 300,
                  duration: 0.2,
                }}
                className="fixed z-50 w-80 bg-background rounded-lg shadow-xl border border-border p-3 pointer-events-none"
                style={{
                  ...getPreviewStyle(),
                  transformOrigin: "top left",
                }}
              >
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="w-full h-auto max-h-60 object-contain rounded"
                />
                <div className="mt-2 text-center">
                  <span className="text-sm font-medium text-foreground">
                    {attachment.name}
                  </span>
                  {attachment.contentType && (
                    <div className="text-xs text-muted-foreground">
                      {attachment.contentType}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
    selectedContent,
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

    // Get user session for avatar
    const { data: session } = authClient.useSession();

    // Get user initials for fallback
    const getUserInitials = (name?: string, email?: string) => {
      if (name) {
        return name
          .split(" ")
          .map((word) => word.charAt(0))
          .join("")
          .toUpperCase()
          .slice(0, 2);
      }
      if (email) {
        return email.charAt(0).toUpperCase();
      }
      return "U";
    };

    const userInitials = session?.user
      ? getUserInitials(session.user.name, session.user.email)
      : "U";

    return (
      <motion.div
        className="group/message no-drag-region w-full py-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="max-w-4xl mx-auto px-4">
          {/* Unified left-aligned layout for all messages */}
          <div className="flex gap-3">
            {/* Avatar section */}
            <div className="flex-shrink-0">
              <div className="size-9 rounded-full overflow-hidden bg-muted flex items-center justify-center ring-1 ring-border/40">
                {isUser ? (
                  session?.user ? (
                    <Avatar className="h-9 w-9">
                      {session.user.image && (
                        <AvatarImage
                          src={session.user.image}
                          alt={session.user.name || "User"}
                        />
                      )}
                      <AvatarFallback className="bg-gradient-to-br from-orange-400 to-pink-500 text-white text-sm font-semibold">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <User size={16} className="text-muted-foreground" />
                  )
                ) : (
                  <BaseLogo size={24} />
                )}
              </div>
            </div>

            {/* Content section */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* Header with role and timestamp - inline with avatar */}
              <div className="flex items-center gap-3 -mt-0.5">
                <span className="text-sm font-semibold text-foreground">
                  {isUser
                    ? session?.user
                      ? session.user.name ||
                        session.user.email?.split("@")[0] ||
                        "You"
                      : "You"
                    : "Convera"}
                </span>
                <span className="text-xs text-muted-foreground/80">
                  {formatTimestamp(message.createdAt)}
                </span>
              </div>

              {/* Attachments section - above content */}
              {hasAttachments && (
                <div className="space-y-2">
                  {message.experimental_attachments?.map(
                    (attachment, index) => (
                      <AttachmentPreview key={index} attachment={attachment} />
                    ),
                  )}
                </div>
              )}

              {/* Selected content section - below attachments, above message content */}
              {selectedContent && (
                <SelectedContentBlock content={selectedContent} />
              )}

              {/* Message content */}
              <div className="text-foreground leading-relaxed">
                {isEditing ? (
                  <div className="space-y-3 pr-1">
                    <textarea
                      className="w-full min-h-[100px] p-3 rounded-lg border border-border bg-background text-foreground resize-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 text-sm transition-all shadow-sm"
                      value={editedContent}
                      onChange={(e) => onEditContentChange(e.target.value)}
                      autoFocus
                      placeholder="Edit your message..."
                    />
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1.5 text-sm rounded-lg bg-background border border-border text-muted-foreground hover:text-foreground transition-colors"
                        onClick={onEditCancel}
                      >
                        Cancel
                      </button>
                      <button
                        className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        onClick={onEditSave}
                      >
                        Save & Regenerate
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none dark:prose-invert text-sm">
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
                  <div className="flex items-center gap-1 -ml-1">
                    <div
                      className={`flex items-center gap-1 transition-opacity duration-200 ${
                        isLastMessage
                          ? "opacity-100"
                          : "opacity-0 group-hover/message:opacity-100"
                      }`}
                    >
                      <button
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        onClick={onCopy}
                        title={isCopied ? "Copied!" : "Copy to clipboard"}
                      >
                        {isCopied ? <Check size={14} /> : <Copy size={14} />}
                      </button>

                      {isUser && isLastUserMessage && (
                        <button
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          onClick={onEditStart}
                          title="Edit message"
                        >
                          <Edit size={14} />
                        </button>
                      )}

                      {!isUser && isLastMessage && (
                        <button
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
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
