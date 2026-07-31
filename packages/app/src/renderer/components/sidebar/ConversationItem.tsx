import React, { useState, useRef, useEffect } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/renderer/components/ui/context-menu";
import type { Conversation } from "@/renderer/libs/db/database";
import {
  updateConversation,
  deleteConversation,
} from "@/renderer/libs/db/hooks";
import { cn } from "@/renderer/libs/utils/tailwind";
import {
  Archive,
  ArchiveRestore,
  MessageSquare,
  Pencil,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  isUnread: boolean;
  onSelect: () => void;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ConversationItem({
  conversation,
  isActive,
  isUnread,
  onSelect,
}: ConversationItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conversation.title || "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isStarred = conversation.metadata?.starred ?? false;
  const isArchived = conversation.metadata?.archived ?? false;

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleRename = async () => {
    const trimmedValue = renameValue.trim();
    if (trimmedValue && trimmedValue !== conversation.title) {
      await updateConversation(conversation.id, { title: trimmedValue });
    }
    setIsRenaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      setRenameValue(conversation.title || "");
      setIsRenaming(false);
    }
  };

  const handleStar = async () => {
    await updateConversation(conversation.id, {
      metadata: {
        ...conversation.metadata,
        starred: !isStarred,
      },
    });
  };

  const handleArchive = async () => {
    await updateConversation(conversation.id, {
      metadata: {
        ...conversation.metadata,
        archived: !isArchived,
      },
    });
  };

  const handleDelete = async () => {
    if (showDeleteConfirm) {
      await deleteConversation(conversation.id);
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  // Every chat is with the same default assistant (Convera), so the row
  // identity is the conversation topic — not a per-row persona.
  const displayTitle = conversation.title || "Untitled conversation";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="relative">
          {isUnread && !isActive && (
            <span className="absolute left-0 top-1/2 h-3 w-1 -translate-x-1 -translate-y-1/2 rounded-full bg-primary" />
          )}
          <button
            onClick={onSelect}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left pointer-events-auto transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "hover:bg-sidebar-hover hover:text-sidebar-foreground",
              !isActive &&
                (isUnread
                  ? "text-sidebar-foreground"
                  : "text-muted-foreground"),
            )}
          >
            <MessageSquare size={14} className="flex-shrink-0 opacity-50" />
            {isRenaming ? (
              <input
                ref={inputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRename}
                onKeyDown={handleKeyDown}
                className="flex-1 min-w-0 bg-transparent border-b border-foreground/30 outline-none text-foreground text-sm"
              />
            ) : (
              <span
                className={cn(
                  "flex-1 min-w-0 truncate text-sm",
                  isUnread && !isActive && "font-semibold",
                )}
              >
                {displayTitle}
              </span>
            )}
            <span className="flex-shrink-0 text-xs text-muted-foreground">
              {formatRelativeTime(conversation.updatedAt)}
            </span>
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => {
            setRenameValue(conversation.title || "");
            setIsRenaming(true);
          }}
        >
          <Pencil size={14} />
          <span>Rename</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={handleStar}>
          {isStarred ? (
            <>
              <StarOff size={14} />
              <span>Unstar</span>
            </>
          ) : (
            <>
              <Star size={14} />
              <span>Star</span>
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem onClick={handleArchive}>
          {isArchived ? (
            <>
              <ArchiveRestore size={14} />
              <span>Unarchive</span>
            </>
          ) : (
            <>
              <Archive size={14} />
              <span>Archive</span>
            </>
          )}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={handleDelete}>
          <Trash2 size={14} />
          <span>{showDeleteConfirm ? "Click again to confirm" : "Delete"}</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
