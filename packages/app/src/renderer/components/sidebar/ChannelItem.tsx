import React, { useState } from "react";
import { Hash, Lock, Pencil, Trash2 } from "lucide-react";
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

interface ChannelItemProps {
  channel: Channel;
  isActive: boolean;
  isUnread: boolean;
  onSelect: () => void;
}

export function ChannelItem({
  channel,
  isActive,
  isUnread,
  onSelect,
}: ChannelItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const Icon = channel.isPrivate ? Lock : Hash;

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
              "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left pointer-events-auto transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "hover:bg-sidebar-hover hover:text-sidebar-foreground",
              !isActive &&
                (isUnread
                  ? "text-sidebar-foreground"
                  : "text-muted-foreground"),
            )}
          >
            <Icon size={13} className="flex-shrink-0 text-muted-foreground" />
            <span
              className={cn(
                "flex-1 min-w-0 truncate text-sm",
                isUnread && !isActive && "font-semibold",
              )}
            >
              {channel.name}
            </span>
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => setIsRenaming(true)}>
          <Pencil size={14} />
          <span>Rename</span>
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
    </ContextMenu>
  );
}
