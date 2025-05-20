import { Attachment, UIMessage } from "ai";
import { motion } from "framer-motion";
import { Check, Copy, Edit, File, Image, RefreshCw } from "lucide-react";
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

/**
 * Individual chat message component for displaying messages with actions
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

    return (
      <motion.div
        className="group/message no-drag-region flex w-full"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mx-auto mb-2 w-full max-w-3xl">
          <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            {/* Message content */}
            <div
              className={`text-foreground overflow-hidden text-sm ${isUser ? "flex flex-col items-end" : ""} max-w-[80%]`}
            >
              <div
                className={`${
                  isUser
                    ? "text-foreground inline-block rounded-[24px] rounded-br-[8px] border-none bg-gray-100 px-4 py-2.5 dark:bg-slate-800/90"
                    : "rounded-[var(--app-border-radius)]"
                } group relative`}
              >
                {/* Editing mode */}
                {isUser && isEditing ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      className="bg-foreground/10 text-foreground min-h-[100px] w-full rounded-md p-2 text-sm"
                      value={editedContent}
                      onChange={(e) => onEditContentChange(e.target.value)}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        className="text-foreground/70 hover:text-foreground rounded-md px-2 py-1 text-xs"
                        onClick={onEditCancel}
                      >
                        Cancel
                      </button>
                      <button
                        className="bg-foreground/10 hover:bg-foreground/20 rounded-md px-2 py-1 text-xs"
                        onClick={onEditSave}
                      >
                        Save & Regenerate
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Regular message display */}
                    {message.content || message.parts ? (
                      <>
                        {/* 1. 附件列表（如果有的话） */}
                        {!message.experimental_attachments?.length ||
                          (message.experimental_attachments?.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {message.experimental_attachments.map((file) => (
                                <div
                                  key={file.name}
                                  className="group relative h-6 no-drag-region flex items-center
                     rounded-[var(--app-border-radius)] border border-gray-500/45
                     bg-background/30 px-2 py-1 text-xs font-medium max-w-[16ch]
                     ml-1 overflow-hidden pr-5"
                                >
                                  {getAttachmentIcon(file)}
                                  <span className="truncate -mr-1">
                                    {file.name}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}

                        {/* 2. 正文 */}
                        {renderContent ? (
                          <div className="mt-2">{renderContent}</div>
                        ) : null}
                      </>
                    ) : (
                      <div className="text-foreground/50 italic">
                        {isUser ? "Empty message" : "..."}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Message action buttons - below the message */}
              {(message.content || message.parts) && !isEditing && (
                <div
                  className={`control-layer mt-2 flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex items-center rounded-md shadow-md transition-opacity duration-200 ${
                      isLastMessage
                        ? "opacity-100"
                        : "opacity-0 group-hover/message:opacity-100"
                    }`}
                  >
                    <button
                      className="text-foreground/50 hover:text-primary active:text-primary/70 mr-2.5 transition-colors"
                      onClick={onCopy}
                      title={isCopied ? "Copied!" : "Copy to clipboard"}
                    >
                      {isCopied ? <Check size={16} /> : <Copy size={16} />}
                    </button>

                    {isUser && isLastUserMessage && (
                      <button
                        className="text-foreground/50 hover:text-primary active:text-primary/70 transition-colors"
                        onClick={onEditStart}
                        title="Edit message"
                      >
                        <Edit size={16} />
                      </button>
                    )}

                    {!isUser && isLastMessage && (
                      <button
                        className="text-foreground/50 hover:text-primary active:text-primary/70 transition-colors"
                        onClick={onRegenerate}
                        title="Regenerate response"
                      >
                        <RefreshCw size={16} />
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

export function getAttachmentIcon(att: Attachment) {
  if (att.contentType?.startsWith("image/")) {
    return <Image size={12} className="flex-shrink-0 mr-1" />;
  }
  return <File size={12} className="flex-shrink-0 mr-1" />;
}
