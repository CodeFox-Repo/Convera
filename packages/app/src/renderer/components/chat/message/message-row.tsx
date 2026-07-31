import { BaseLogo } from "@/renderer/components/common/base-logo";
import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/renderer/components/ui/popover";
import { resolveSenderName } from "@/renderer/libs/chat-labels";
import { LOCAL_HUMAN_MEMBER_ID } from "@/renderer/libs/db/database";
import { toggleReaction } from "@/renderer/libs/db/hooks";
import { cn } from "@/renderer/libs/utils/tailwind";
import { SelectedContent } from "@/renderer/libs/stores/chat-store";
import type { UIMessage } from "@/renderer/types/chat";
import type { Member } from "@/shared/types/workspace";
import { motion } from "framer-motion";
import {
  Check,
  Copy,
  Edit,
  GitBranch,
  RefreshCw,
  Reply,
  SmilePlus,
} from "lucide-react";
import React, { memo } from "react";
import SelectedContentBlock from "../selected/selected-content-block";
import { AttachmentPreview, formatTimestamp } from "./chat-message";

/** Width of the avatar column, so grouped rows line up under the body. */
const BODY_INDENT = "pl-12";

/** Fixed palette — a full emoji picker buys nothing for a reaction row. */
const REACTION_EMOJI = ["👍", "❤️", "😂", "🎉", "👀", "🙌", "🤔", "🚀"];

export interface MessageRowProps {
  message: UIMessage;
  messageIndex: number;
  sender?: Member;
  /** Names assistant rows that predate senderId; falls back to "Assistant". */
  agentName?: string | null;
  /** Previous row has the same speaker: drop the repeated avatar and name. */
  isGrouped: boolean;
  /**
   * Reactions are a room gesture. A channel shows them; a 1:1 chat with your
   * assistant does not — reacting to your own bot is noise.
   */
  showReactions: boolean;
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
  onReply: () => void;
  onBranch: (messageIndex: number) => void;
  replyTarget?: {
    id: string;
    senderName: string;
    content: string;
  } | null;
  onOpenReplyTarget: () => void;
  renderContent: React.ReactNode;
}

/**
 * Reactions live on the persisted row, so a message still streaming has none
 * to show and nothing to write to — the chips simply appear once it is saved.
 */
function ReactionBar({
  messageId,
  reactions,
}: {
  messageId: string;
  reactions?: Record<string, string[]>;
}) {
  const entries = Object.entries(reactions ?? {});
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {entries.map(([emoji, reactors]) => {
        const mine = reactors.includes(LOCAL_HUMAN_MEMBER_ID);
        return (
          <button
            key={emoji}
            className={cn(
              "flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-xs transition-colors",
              mine
                ? "border-primary bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() =>
              void toggleReaction(messageId, emoji, LOCAL_HUMAN_MEMBER_ID)
            }
            aria-pressed={mine}
            title={`${reactors.length} reacted with ${emoji}`}
          >
            <span className="leading-none">{emoji}</span>
            <span className="tabular-nums">{reactors.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function AddReactionButton({ messageId }: { messageId: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          title="Add reaction"
          aria-label="Add reaction"
        >
          <SmilePlus size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1">
        <div className="flex items-center gap-0.5">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              className="rounded p-1 text-base leading-none transition-colors hover:bg-accent"
              onClick={() => {
                void toggleReaction(messageId, emoji, LOCAL_HUMAN_MEMBER_ID);
                setOpen(false);
              }}
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const MessageRow = memo(
  ({
    message,
    messageIndex,
    sender,
    agentName,
    isGrouped,
    showReactions,
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
    onReply,
    onBranch,
    replyTarget,
    onOpenReplyTarget,
    renderContent,
  }: MessageRowProps) => {
    const isUser = message.role === "user";
    const isHuman = sender ? sender.kind === "human" : isUser;
    const name = resolveSenderName({
      senderName: sender?.name,
      isUser,
      agentName,
    });
    const sentAt = new Date(message.createdAt ?? Date.now());
    const timestamp = formatTimestamp(message.createdAt);
    const isoTimestamp = sentAt.toISOString();
    const hasAttachments =
      message.experimental_attachments &&
      message.experimental_attachments.length > 0;

    return (
      <motion.div
        data-message-id={message.id}
        className={cn(
          "group/message no-drag-region w-full",
          isGrouped ? "py-0.5" : "py-1.5",
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="w-full px-4">
          <div
            className={cn("flex gap-3", isGrouped && BODY_INDENT)}
            title={isGrouped ? `${name} · ${timestamp}` : undefined}
          >
            {!isGrouped && (
              <div className="flex-shrink-0">
                <MemberAvatar
                  member={sender}
                  isHuman={isHuman}
                  className="size-9 text-sm"
                  fallback={isHuman ? undefined : <BaseLogo size={24} />}
                />
              </div>
            )}

            <div className="flex-1 min-w-0 space-y-1">
              {isGrouped ? (
                // The header is gone but the time must not be: screen readers
                // get it here, sighted users get it from the row's title.
                <time className="sr-only" dateTime={isoTimestamp}>
                  {timestamp}
                </time>
              ) : (
                <div className="flex items-baseline gap-2 -mt-0.5">
                  <span className="text-sm font-semibold text-foreground">
                    {name}
                  </span>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={isoTimestamp}
                  >
                    {timestamp}
                  </time>
                </div>
              )}

              {hasAttachments && (
                <div className="space-y-2">
                  {message.experimental_attachments?.map(
                    (attachment, index) => (
                      <AttachmentPreview key={index} attachment={attachment} />
                    ),
                  )}
                </div>
              )}

              {selectedContent && (
                <SelectedContentBlock content={selectedContent} />
              )}

              {message.replyToMessageId && (
                <button
                  type="button"
                  onClick={onOpenReplyTarget}
                  className="block w-full max-w-2xl rounded-md border-l-2 border-primary bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted"
                  title={
                    replyTarget
                      ? `Jump to ${replyTarget.senderName}'s message`
                      : "Original message unavailable"
                  }
                >
                  <span className="block truncate text-xs font-medium text-foreground">
                    {replyTarget?.senderName ?? "Original message unavailable"}
                  </span>
                  {replyTarget && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {replyTarget.content || "Empty message"}
                    </span>
                  )}
                </button>
              )}

              <div className="text-foreground leading-relaxed">
                {isEditing ? (
                  <div className="space-y-3 pr-1">
                    <textarea
                      className="w-full min-h-[100px] p-3 rounded-lg border border-border text-foreground resize-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm transition-all"
                      value={editedContent}
                      onChange={(e) => onEditContentChange(e.target.value)}
                      autoFocus
                      placeholder="Edit your message..."
                    />
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                        onClick={onEditCancel}
                      >
                        Cancel
                      </button>
                      <button
                        className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground transition-colors"
                        onClick={onEditSave}
                      >
                        Save &amp; Regenerate
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

              {showReactions && !isEditing && (
                <ReactionBar
                  messageId={message.id}
                  reactions={message.reactions}
                />
              )}

              {(message.content || message.parts || hasAttachments) &&
                !isEditing && (
                  <div
                    className={cn(
                      "flex items-center gap-1 -ml-1 transition-opacity duration-200",
                      isLastMessage
                        ? "opacity-100"
                        : "opacity-0 group-hover/message:opacity-100 focus-within:opacity-100",
                    )}
                  >
                    {showReactions && (
                      <AddReactionButton messageId={message.id} />
                    )}

                    <button
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                      onClick={onReply}
                      title="Reply to message"
                      aria-label="Reply to message"
                    >
                      <Reply size={14} />
                    </button>

                    <button
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                      onClick={onCopy}
                      title={isCopied ? "Copied!" : "Copy to clipboard"}
                    >
                      {isCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>

                    {isUser && isLastUserMessage && (
                      <button
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                        onClick={onEditStart}
                        title="Edit message"
                      >
                        <Edit size={14} />
                      </button>
                    )}

                    {!isUser && isLastMessage && (
                      <button
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                        onClick={onRegenerate}
                        title="Regenerate response"
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}

                    {!isUser && (
                      <button
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => onBranch(messageIndex)}
                        title="Branch from here"
                      >
                        <GitBranch size={14} />
                      </button>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  },
);

MessageRow.displayName = "MessageRow";

export default MessageRow;
