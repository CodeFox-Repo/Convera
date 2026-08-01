import { BaseLogo } from "@/renderer/components/common/base-logo";
import { FullEmojiPicker } from "@/renderer/components/common/emoji-picker";
import { CornerDownRight, CornerUpLeft } from "lucide-react";
import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import { MemberCard } from "@/renderer/components/common/member-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/renderer/components/ui/popover";
import { resolveSenderName } from "@/renderer/libs/chat-labels";
import { LOCAL_HUMAN_MEMBER_ID } from "@/renderer/libs/db/database";
import { toggleReaction } from "@/renderer/libs/db/hooks";
import { cn } from "@/renderer/libs/utils/tailwind";
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
import { AttachmentPreview, formatTimestamp } from "./chat-message";

/** Width of the avatar column, so grouped rows line up under the body. */
const BODY_INDENT = "pl-12";

export interface MessageRowProps {
  message: UIMessage;
  messageIndex: number;
  sender?: Member;
  /** Resolves a member id to a display name (reaction tooltips). */
  nameOf: (memberId: string) => string | undefined;
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
  /** How many later messages answered this one; 0 hides the thread line. */
  replyCount: number;
  onOpenReplies: () => void;
  renderContent: React.ReactNode;
}

/**
 * "You, Elena and Noah reacted with 👍" — the chip's own tooltip, because a
 * bare count says a room responded without saying who is in it. Yourself first
 * and by name, the way every other client writes it.
 */
export function reactionTitle(
  emoji: string,
  reactors: string[],
  nameOf: (memberId: string) => string | undefined,
): string {
  const mine = reactors.includes(LOCAL_HUMAN_MEMBER_ID);
  const names = [
    ...(mine ? ["You"] : []),
    // An id that resolves to nobody is a member who has left, not a reaction
    // that did not happen: keep it counted rather than dropping the name.
    ...reactors
      .filter((id) => id !== LOCAL_HUMAN_MEMBER_ID)
      .map((id) => nameOf(id) ?? id),
  ];
  const listed =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${listed} reacted with ${emoji}`;
}

/**
 * Reactions live on the persisted row, so a message still streaming has none
 * to show and nothing to write to — the chips simply appear once it is saved.
 */
function ReactionBar({
  messageId,
  reactions,
  nameOf,
}: {
  messageId: string;
  reactions?: Record<string, string[]>;
  /**
   * Injected rather than queried: a useMembers() here would open one members
   * live query per message row — 200 rows, 200 subscriptions, all refiring on
   * any member edit. The transcript already holds one.
   */
  nameOf: (memberId: string) => string | undefined;
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
            title={reactionTitle(emoji, reactors, nameOf)}
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
      <PopoverContent align="start" className="w-auto overflow-hidden p-1">
        <FullEmojiPicker
          onPick={(emoji) => {
            void toggleReaction(messageId, emoji, LOCAL_HUMAN_MEMBER_ID);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

const MessageRow = memo(
  ({
    message,
    messageIndex,
    sender,
    nameOf,
    agentName,
    isGrouped,
    showReactions,
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
    onReply,
    onBranch,
    replyTarget,
    onOpenReplyTarget,
    replyCount,
    onOpenReplies,
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
                {sender ? (
                  // The avatar is where the eye already is when "who is this?"
                  // arrives — same card as the roster, one click closer.
                  <MemberCard member={sender} side="right" align="start">
                    <button
                      type="button"
                      className="block rounded-md"
                      aria-label={`About ${sender.name}`}
                    >
                      <MemberAvatar
                        member={sender}
                        isHuman={isHuman}
                        className="size-9 text-sm"
                      />
                    </button>
                  </MemberCard>
                ) : (
                  <MemberAvatar
                    member={sender}
                    isHuman={isHuman}
                    className="size-9 text-sm"
                    fallback={isHuman ? undefined : <BaseLogo size={24} />}
                  />
                )}
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

              {message.replyToMessageId && (
                // One quiet line, the way Slack draws a thread reference — a
                // boxed quote made every agent reply look like a form letter.
                <button
                  type="button"
                  onClick={onOpenReplyTarget}
                  className="flex max-w-2xl items-baseline gap-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                  title={
                    replyTarget
                      ? `Jump to ${replyTarget.senderName}'s message`
                      : "Original message unavailable"
                  }
                >
                  <CornerUpLeft
                    size={11}
                    className="flex-shrink-0 translate-y-px"
                    aria-hidden="true"
                  />
                  <span className="flex-shrink-0 font-medium">
                    {replyTarget?.senderName ?? "unavailable"}
                  </span>
                  {replyTarget && (
                    <span className="truncate">
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
                  nameOf={nameOf}
                />
              )}

              {replyCount > 0 && !isEditing && (
                // The other half of the reply reference: a reply names its
                // parent, so the parent should say it drew answers. Clicking
                // walks to the first one rather than unfolding a panel — the
                // replies are already in this transcript, in order, so there is
                // nothing to fetch and nothing to collapse.
                <button
                  type="button"
                  onClick={onOpenReplies}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
                  title="Jump to the first reply"
                >
                  <CornerDownRight
                    size={11}
                    className="flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    {replyCount === 1 ? "1 reply" : `${replyCount} replies`}
                  </span>
                </button>
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
