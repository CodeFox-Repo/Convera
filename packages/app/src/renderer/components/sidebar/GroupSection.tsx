import React, { useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/renderer/components/ui/context-menu";
import type { Channel, Group } from "@/renderer/libs/stores/channel-store";
import {
  createChannel,
  deleteGroup,
  renameGroup,
} from "@/renderer/libs/stores/channel-store";
import { cn } from "@/renderer/libs/utils/tailwind";
import { ChannelItem } from "./ChannelItem";
import { InlineNameInput } from "./InlineNameInput";

interface GroupSectionProps {
  /** null renders the implicit "Ungrouped" section. */
  group: Group | null;
  label: string;
  channels: Channel[];
  currentConversationId: string | null;
  isChannelUnread: (channel: Channel) => boolean;
  onSelectChannel: (channel: Channel) => void;
  /** Legacy conversations, rendered under the ungrouped section. */
  children?: React.ReactNode;
}

export function GroupSection({
  group,
  label,
  channels,
  currentConversationId,
  isChannelUnread,
  onSelectChannel,
  children,
}: GroupSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Collapsed hides only what the user has already read: a hidden unread
  // channel is a lost message.
  const visibleChannels = collapsed
    ? channels.filter(
        (channel) =>
          isChannelUnread(channel) ||
          channel.conversationId === currentConversationId,
      )
    : channels;

  const startAddingChannel = () => {
    setCollapsed(false);
    setIsAddingChannel(true);
  };

  const header = (
    <div className="group flex items-center gap-1 pr-1">
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex flex-1 min-w-0 items-center gap-1 px-2 py-1 rounded-md text-muted-foreground hover:text-sidebar-foreground transition-colors pointer-events-auto"
      >
        <ChevronDown
          size={12}
          className={cn(
            "flex-shrink-0 transition-transform",
            collapsed && "-rotate-90",
          )}
        />
        {group?.icon && <span className="text-xs">{group.icon}</span>}
        <span className="truncate text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </button>
      <button
        onClick={startAddingChannel}
        aria-label={`New channel in ${label}`}
        title="New channel"
        className="p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-sidebar-foreground transition-opacity pointer-events-auto"
      >
        <Plus size={12} />
      </button>
    </div>
  );

  const contextItems = (
    <>
      <ContextMenuItem onClick={startAddingChannel}>
        <Plus size={14} />
        <span>New channel</span>
      </ContextMenuItem>
      {group && (
        <>
          <ContextMenuItem onClick={() => setIsRenaming(true)}>
            <Pencil size={14} />
            <span>Rename group</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onClick={() => {
              if (confirmDelete) void deleteGroup(group.id);
              else setConfirmDelete(true);
            }}
          >
            <Trash2 size={14} />
            <span>
              {confirmDelete ? "Click again to confirm" : "Delete group"}
            </span>
          </ContextMenuItem>
        </>
      )}
    </>
  );

  return (
    <div>
      {isRenaming && group ? (
        <div className="px-2 py-1">
          <InlineNameInput
            placeholder="Group name"
            initialValue={group.name}
            onSubmit={(name) => {
              void renameGroup(group.id, name);
              setIsRenaming(false);
            }}
            onCancel={() => setIsRenaming(false)}
          />
        </div>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
          <ContextMenuContent>{contextItems}</ContextMenuContent>
        </ContextMenu>
      )}

      <div className="space-y-0.5">
        {visibleChannels.map((channel) => (
          <ChannelItem
            key={channel.id}
            channel={channel}
            isActive={currentConversationId === channel.conversationId}
            isUnread={isChannelUnread(channel)}
            onSelect={() => onSelectChannel(channel)}
          />
        ))}
        {isAddingChannel && (
          <div className="px-2 py-0.5">
            <InlineNameInput
              placeholder="Channel name"
              onSubmit={(name) => {
                void createChannel({ name, groupId: group?.id ?? null });
                setIsAddingChannel(false);
              }}
              onCancel={() => setIsAddingChannel(false)}
            />
          </div>
        )}
        {!collapsed && children}
      </div>
    </div>
  );
}
