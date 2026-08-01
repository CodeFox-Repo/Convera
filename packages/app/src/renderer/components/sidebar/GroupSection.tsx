import React, { useState } from "react";
import { ChevronDown, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  CHANNEL_LIST_ATTR,
  groupAttr,
  type ChannelDrag,
} from "./use-channel-drag";
import { GROUP_HEADER_ATTR, type GroupDrag } from "./use-group-drag";

interface GroupSectionProps {
  /** null renders the implicit "Ungrouped" section. */
  group: Group | null;
  label: string;
  channels: Channel[];
  currentConversationId: string | null;
  channelUnreadCount: (channel: Channel) => number;
  onSelectChannel: (channel: Channel) => void;
  drag?: ChannelDrag;
  groupDrag?: GroupDrag;
  groupDragging?: boolean;
  /** Hide the header when the sidebar has only the implicit section. */
  showHeader?: boolean;
  onNewGroup?: () => void;
  /** Legacy conversations, rendered under the ungrouped section. */
  children?: React.ReactNode;
}

export function GroupSection({
  group,
  label,
  channels,
  currentConversationId,
  channelUnreadCount,
  onSelectChannel,
  drag,
  groupDrag,
  groupDragging,
  showHeader = true,
  onNewGroup,
  children,
}: GroupSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Rendered in the order a drop would produce, so the neighbours slide aside
  // as the cursor passes and the gap under it *is* the drop indicator. Falls
  // back to the stored order whenever nothing is being dragged.
  const ordered = drag?.previewFor(group?.id ?? null) ?? channels;

  // Collapsed hides only what the user has already read: a hidden unread
  // channel is a lost message.
  const visibleChannels = collapsed
    ? ordered.filter(
        (channel) =>
          channelUnreadCount(channel) > 0 ||
          channel.conversationId === currentConversationId,
      )
    : ordered;

  const startAddingChannel = () => {
    setCollapsed(false);
    setIsAddingChannel(true);
  };

  const header = (
    <div
      className={cn(
        "group flex items-center gap-1 pr-1",
        groupDragging && "opacity-40",
      )}
      // Only a real group can be reordered; the implicit General heading is
      // not a row in the table and has nowhere to move to.
      {...(group ? { [GROUP_HEADER_ATTR]: group.id } : {})}
      draggable={!!group}
      {...(group && groupDrag ? groupDrag.headerHandlers(group.id) : {})}
    >
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
      {onNewGroup && (
        <ContextMenuItem onClick={onNewGroup}>
          <FolderPlus size={14} />
          <span>New group</span>
        </ContextMenuItem>
      )}
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

  const groupDrop = drag?.groupHandlers(group?.id ?? null);

  return (
    <div>
      {isRenaming && group ? (
        <div className="px-1 py-1">
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
        showHeader && (
          <ContextMenu>
            <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
            <ContextMenuContent>{contextItems}</ContextMenuContent>
          </ContextMenu>
        )
      )}

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            // gap, not space-y: sibling margins are applied to whichever
            // element is second at that instant, so a row that animates into
            // first place loses its spacing mid-flight.
            //
            // No tint while a channel hovers here: the gap the rows open is
            // already saying where the drop lands, and a block of colour
            // behind them made the group look selected instead.
            className={cn(
              "flex flex-col rounded-md px-1",
              // An empty group takes no room at all — a heading floating above
              // a blank gap reads as a rendering fault, not as a section.
              visibleChannels.length > 0 && "gap-0.5 py-0.5",
              // ...except while something is being dragged, when it needs an
              // area to be dropped onto: that is how a channel is filed into
              // a group it is not in yet.
              visibleChannels.length === 0 && drag?.draggingId && "min-h-8",
            )}
            // One drop zone per group rather than one per row: the pointer is
            // measured against the layout as it was before any preview moved
            // it, which the rows themselves cannot report once they start
            // sliding.
            {...{ [CHANNEL_LIST_ATTR]: groupAttr(group?.id ?? null) }}
            onDragOver={groupDrop?.onDragOver}
            onDrop={groupDrop?.onDrop}
          >
            {visibleChannels.map((channel) => (
              <ChannelItem
                key={channel.id}
                channel={channel}
                isActive={currentConversationId === channel.conversationId}
                unreadCount={channelUnreadCount(channel)}
                onSelect={() => onSelectChannel(channel)}
                isDragging={drag?.draggingId === channel.id}
                {...(drag?.itemHandlers(channel) ?? {})}
              />
            ))}
            {isAddingChannel && (
              <div className="px-1 py-0.5">
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
        </ContextMenuTrigger>
        <ContextMenuContent>{contextItems}</ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
