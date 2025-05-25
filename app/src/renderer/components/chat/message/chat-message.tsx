import { Attachment, UIMessage } from "ai";
import { motion } from "framer-motion";
import { Check, Copy, Edit, File, RefreshCw } from "lucide-react";
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

// Enhanced attachment preview component with more visual interest
const AttachmentPreview = ({ attachment }: { attachment: Attachment }) => {
  const isImage = attachment.contentType?.startsWith("image/");
  return (
    <motion.div 
      className="group relative h-8 no-drag-region flex items-center rounded-xl border border-white/15 dark:border-gray-600/20 bg-gradient-to-r from-white/25 via-white/20 to-white/15 dark:from-gray-800/15 dark:via-gray-750/12 dark:to-gray-700/8 backdrop-blur-2xl px-3 py-2 text-xs font-medium max-w-[16ch] overflow-hidden transition-all duration-200"
      whileHover={{ scale: 1.05, y: -1 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      {isImage ? (
        <div className="size-4 flex-shrink-0 mr-2 rounded overflow-hidden">
          <img src={attachment.url} alt="" className="size-full object-cover" />
        </div>
      ) : (
        <File size={14} className="flex-shrink-0 mr-2 text-gray-600 dark:text-gray-400" />
      )}
      <span className="truncate text-gray-700 dark:text-gray-300">{attachment.name}</span>
    </motion.div>
  );
};

/**
 * Enhanced individual chat message component
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
    const hasAttachments = message.experimental_attachments && message.experimental_attachments.length > 0;

    return (
      <motion.div
        className="group/message no-drag-region flex w-full mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="w-full max-w-none">
          <div className={`flex gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
            {/* Avatar - only show for assistant/bot messages */}
            {!isUser && (
              <motion.div 
                className="flex-shrink-0 w-14 h-14 overflow-hidden"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.3, type: "spring" }}
              >
                <img 
                  src="../../../images/icon.png" 
                  alt="FoxyChat Agent" 
                  className="w-8 h-8 object-contain opacity-90"
                />
              </motion.div>
            )}

            {/* Message content */}
            <div className={`flex-1 min-w-0 ${isUser ? "flex flex-col items-end" : ""}`}>
              {/* Message bubble with enhanced visual interest */}
              <motion.div
                className={`relative max-w-[85%] ${
                  isUser 
                    ? "bg-gradient-to-br from-blue-50/40 via-blue-100/35 to-blue-150/30 dark:from-blue-900/15 dark:via-blue-800/12 dark:to-blue-700/8 border-blue-200/20 dark:border-blue-600/15" 
                    : ""
                } backdrop-blur-2xl ${
                  isUser ? "rounded-2xl rounded-tl-none" : "rounded-2xl rounded-bl-md"
                } overflow-hidden hover:scale-[1.02] transition-all duration-200`}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                whileHover={{ 
                  y: -2,
                  transition: { duration: 0.2 }
                }}
              >
                {/* Editing mode */}
                {isUser && isEditing ? (
                  <div className="p-4 space-y-4">
                    <textarea
                      className="w-full min-h-[100px] p-3 rounded-xl bg-white/30 dark:bg-gray-800/30 backdrop-blur-2xl border border-gray-200/15 dark:border-gray-600/15 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-200"
                      value={editedContent}
                      onChange={(e) => onEditContentChange(e.target.value)}
                      placeholder="Edit your message..."
                      autoFocus
                    />
                    <div className="flex justify-end gap-3">
                      <button
                        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-gray-700/80 transition-all duration-200"
                        onClick={onEditCancel}
                      >
                        Cancel
                      </button>
                      <button
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
                        onClick={onEditSave}
                      >
                        Save & Regenerate
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    {/* Message content */}
                    {message.content || message.parts ? (
                      <div className={`text-sm leading-relaxed ${
                        isUser 
                          ? "text-blue-900 dark:text-blue-100" 
                          : "text-gray-900 dark:text-gray-100"
                      }`}>
                        {renderContent}
                      </div>
                    ) : (
                      <div className="text-gray-500 dark:text-gray-400 italic text-sm">
                        {isUser ? "Empty message" : "..."}
                      </div>
                    )}

                    {/* Attachments */}
                    {hasAttachments && (
                      <div className={`flex flex-wrap gap-2 ${message.content ? "mt-3" : ""}`}>
                        {message.experimental_attachments?.map((attachment, index) => (
                          <AttachmentPreview key={index} attachment={attachment} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>

              {/* Action buttons */}
              {(message.content || message.parts || hasAttachments) && !isEditing && (
                <motion.div
                  className={`mt-3 flex ${isUser ? "justify-end" : "justify-start"}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ 
                    opacity: isLastMessage ? 1 : 0,
                    y: isLastMessage ? 0 : 10
                  }}
                  whileHover={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-gradient-to-r from-white/30 via-white/25 to-white/20 dark:from-gray-800/25 dark:via-gray-750/20 dark:to-gray-700/15 backdrop-blur-2xl border border-white/15 dark:border-gray-600/15 hover:from-white/40 hover:via-white/35 hover:to-white/30 dark:hover:from-gray-800/35 dark:hover:via-gray-750/30 dark:hover:to-gray-700/25 transition-all duration-200">
                    <motion.button
                      className={`p-1.5 rounded-full transition-all duration-200 ${
                        isCopied 
                          ? "text-green-600 dark:text-green-400 bg-green-100/80 dark:bg-green-900/30" 
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-gray-700/80"
                      }`}
                      onClick={onCopy}
                      title={isCopied ? "Copied!" : "Copy to clipboard"}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {isCopied ? <Check size={14} /> : <Copy size={14} />}
                    </motion.button>

                    {isUser && isLastUserMessage && (
                      <motion.button
                        className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-100/80 dark:hover:bg-blue-900/30 transition-all duration-200"
                        onClick={onEditStart}
                        title="Edit message"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Edit size={14} />
                      </motion.button>
                    )}

                    {!isUser && isLastMessage && (
                      <motion.button
                        className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-100/80 dark:hover:bg-orange-900/30 transition-all duration-200"
                        onClick={onRegenerate}
                        title="Regenerate response"
                        whileHover={{ scale: 1.1, rotate: 180 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <RefreshCw size={14} />
                      </motion.button>
                    )}
                  </div>
                </motion.div>
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