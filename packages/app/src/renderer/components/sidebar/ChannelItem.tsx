import React, { useState } from "react";
import { motion } from "framer-motion";
import { Hash, Lock, Pencil, Trash2, Users } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/renderer/components/ui/context-menu";
import type { Channel } from "@/renderer/libs/stores/channel-store";
import {
  deleteChannel,
  renameChannel,
} from "@/renderer/libs/stores/channel-store";
import { cn } from "@/renderer/libs/utils/tailwind";
import { InlineNameInput } from "./InlineNameInput";
import { useMember } from "@/renderer/libs/stores/member-store";
import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import { CHANNEL_ROW_ATTR } from "./use-channel-drag";
import { ChannelVisibilityDialog } from "./ChannelVisibilityDialog";
import { UnreadBadge } from "./UnreadBadge";

interface ChannelItemProps {
  channel: Channel;
  isActive: boolean;
  unreadCount: number;
  onSelect: () => void;
  onDragStart?: (event: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}

export function ChannelItem({
  channel,
  isActive,
  unreadCount,
  onSelect,
  onDragStart,
  onDragEnd,
  isDragging,
}: ChannelItemProps) {
  const isUnread = unreadCount > 0;
  const [isRenaming, setIsRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditingVisibility, setIsEditingVisibility] = useState(false);
  // A restricted channel wears the lock, whether it is restricted by tags or
  // by the pre-tag private flag.
  const isRestricted =
    (channel.visibleToTags ?? []).length > 0 || !!channel.isPrivate;
  const Icon = isRestricted ? Lock : Hash;
  const directMessageAgent = useMember(
    channel.kind === "dm" ? channel.defaultAgentMemberId : null,
  );

  if (isRenaming) {
    return (
      <div className="px-2 py-0.5">
        <InlineNameInput
          placeholder="Channel name"
          initialValue={channel.name}
          onSubmit={(name) => {
            void renameChannel(channel.id, name);
            setIsRenaming(false);
          }}
          onCancel={() => setIsRenaming(false)}
        />
      </div>
    );
  }

  const item = (
    // The list is already rendered in drop order, so `layout` is what turns
    // that reorder into neighbours sliding out of the way. Spring, not a
    // duration: it settles by overshooting slightly, which reads as the row
    // being pushed rather than teleporting. No drop line is drawn — the gap
    // that opens under the cursor says the same thing without the clutter.
    //
    // The native drag handlers stay on a plain child: motion.div claims
    // onDragStart/onDragEnd for its own pointer-gesture API, which is a
    // different feature with the same names.
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 620, damping: 34, mass: 0.55 }}
    >
      <div
        // The browser's drag image is the copy under the cursor, so the row
        // left behind in the list reads as the vacated slot.
        className={cn("relative", isDragging && "opacity-40")}
        // Hit-testing belongs to the list, which measures the pointer against
        // the pre-drag layout; a row that is mid-slide cannot report where it
        // used to be. It only marks itself so that snapshot can find it.
        {...(channel.kind === "dm" ? {} : { [CHANNEL_ROW_ATTR]: channel.id })}
        draggable={channel.kind !== "dm"}
        onDragStart={channel.kind === "dm" ? undefined : onDragStart}
        onDragEnd={channel.kind === "dm" ? undefined : onDragEnd}
      >
        {isUnread && !isActive && (
          <span className="absolute left-0 top-1/2 h-3 w-1 -translate-x-1 -translate-y-1/2 rounded-full bg-primary" />
        )}
        <button
          onClick={onSelect}
          className={cn(
            "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left pointer-events-auto transition-colors",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "hover:bg-sidebar-hover hover:text-sidebar-foreground",
            !isActive &&
              (isUnread ? "text-sidebar-foreground" : "text-muted-foreground"),
          )}
        >
          {channel.kind === "dm" ? (
            <MemberAvatar member={directMessageAgent} className="size-5" />
          ) : (
            <Icon size={13} className="flex-shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              "flex-1 min-w-0 truncate text-sm",
              isUnread && !isActive && "font-semibold",
            )}
          >
            {directMessageAgent?.name ?? channel.name}
          </span>
          <UnreadBadge count={unreadCount} />
        </button>
      </div>
    </motion.div>
  );

  // A durable DM is reopened from its agent identity. Generic channel rename
  // and delete actions would make that stable relationship look disposable.
  if (channel.kind === "dm") return item;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{item}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => setIsRenaming(true)}>
          <Pencil size={14} />
          <span>Rename</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => setIsEditingVisibility(true)}>
          <Users size={14} />
          <span>Who can find this</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => {
            if (confirmDelete) void deleteChannel(channel.id);
            else setConfirmDelete(true);
          }}
        >
          <Trash2 size={14} />
          <span>{confirmDelete ? "Click again to confirm" : "Delete"}</span>
        </ContextMenuItem>
      </ContextMenuContent>
      <ChannelVisibilityDialog
        channel={channel}
        open={isEditingVisibility}
        onOpenChange={setIsEditingVisibility}
      />
    </ContextMenu>
  );
}
