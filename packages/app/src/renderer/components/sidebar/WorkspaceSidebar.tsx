import React, { useEffect, useMemo, useState } from "react";
import {
  FolderPlus,
  MessageCircle,
  Plus,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  useActiveConversations,
  useUnreadCounts,
} from "@/renderer/libs/db/hooks";
import { useSelectionStore, useUnreadStore } from "@/renderer/libs/db/ui-state";
import {
  createChannel,
  createGroup,
  useVisibleChannels,
  useGroups,
  type Channel,
} from "@/renderer/libs/stores/channel-store";
import { useMember, useMembers } from "@/renderer/libs/stores/member-store";
import { LOCAL_HUMAN_MEMBER_ID } from "@/renderer/libs/db";
import { ensureAgentDM } from "@/renderer/libs/agent-dm";
import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import { cn } from "@/renderer/libs/utils/tailwind";
import { ConversationItem } from "./ConversationItem";
import { ChannelItem } from "./ChannelItem";
import { GroupSection } from "./GroupSection";
import { InlineNameInput } from "./InlineNameInput";
import { formatUnread } from "./UnreadBadge";
import { useWorkspaceUI } from "@/renderer/libs/stores/workspace-ui-context";
import { useChannelDrag } from "./use-channel-drag";
import { useGroupDrag } from "./use-group-drag";
import { motion } from "framer-motion";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/renderer/components/ui/context-menu";

const SECTION_LABEL =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";

export function WorkspaceSidebar({ onNewChat }: { onNewChat?: () => void }) {
  const groups = useGroups();
  // The same rule an agent's list_channels uses: a tag hides a room from
  // people too, not only from colleagues.
  const channels = useVisibleChannels();
  const members = useMembers();
  const conversations = useActiveConversations();
  const { currentConversationId, setCurrentConversation } = useSelectionStore();
  const { markSeen } = useUnreadStore();
  const unreadCounts = useUnreadCounts();
  const {
    sidebarTab: activeTab,
    setSidebarTab: setActiveTab,
    setView,
  } = useWorkspaceUI();
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [isAddingFirstChannel, setIsAddingFirstChannel] = useState(false);
  const [isStartingDM, setIsStartingDM] = useState(false);

  const unreadCountFor = (conversationId: string) =>
    // The room you are standing in is read as it arrives, so it never wears a
    // badge for messages you are watching land.
    conversationId === currentConversationId
      ? 0
      : (unreadCounts[conversationId] ?? 0);

  const channelUnreadCount = (channel: Channel) =>
    unreadCountFor(channel.conversationId);

  // Watching a channel keeps it read: without this the boundary would stay
  // where it was when you clicked, and everything said while you sat there
  // would go bold the moment you looked away.
  useEffect(() => {
    if (!currentConversationId) return;
    if ((unreadCounts[currentConversationId] ?? 0) === 0) return;
    markSeen(currentConversationId);
  }, [currentConversationId, unreadCounts, markSeen]);

  const select = (conversationId: string) => {
    markSeen(conversationId);
    setCurrentConversation(conversationId);
    // Picking a room means you want to be in it: the content pane may be
    // showing Agents or Inbox, and selecting without switching left the click
    // looking dead.
    setView("chat");
  };

  const teamChannels = useMemo(
    () => (channels ?? []).filter((channel) => channel.kind === "channel"),
    [channels],
  );
  const directMessages = useMemo(
    () =>
      (channels ?? [])
        .filter((channel) => channel.kind === "dm")
        .sort((left, right) => left.name.localeCompare(right.name)),
    [channels],
  );
  const agentsWithoutDM = useMemo(() => {
    const existing = new Set(
      directMessages.flatMap((channel) => channel.memberIds),
    );
    return (members ?? []).filter(
      (member) =>
        member.kind === "agent" && !!member.agentId && !existing.has(member.id),
    );
  }, [directMessages, members]);

  const drag = useChannelDrag(teamChannels);
  const groupDrag = useGroupDrag(groups ?? []);
  // Groups in the order a drop would produce, for the same reason the channel
  // list previews itself: the gap that opens is the drop indicator.
  const orderedGroups = useMemo(
    () => groupDrag.preview(groups ?? []),
    [groupDrag, groups],
  );

  const channelsByGroup = useMemo(() => {
    const byGroup = new Map<string | null, Channel[]>();
    for (const channel of teamChannels) {
      const list = byGroup.get(channel.groupId);
      if (list) list.push(channel);
      else byGroup.set(channel.groupId, [channel]);
    }
    for (const list of byGroup.values()) {
      list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    return byGroup;
  }, [teamChannels]);

  // Conversations nobody's channel points at: 1:1 chats, listed under CHATS.
  const plainConversations = useMemo(() => {
    const claimed = new Set((channels ?? []).map((c) => c.conversationId));
    return (conversations ?? []).filter((c) => !claimed.has(c.id));
  }, [conversations, channels]);

  const selectChannel = (channel: Channel) => select(channel.conversationId);
  const hasChannels = teamChannels.length > 0;

  // Open in a room, not on a welcome screen. Starting with no selection —
  // first run, or a reload after the remembered conversation was deleted —
  // used to leave the pane empty while the sidebar plainly listed channels.
  //
  // A channel rather than the most recent chat: this is a workspace, and
  // where the team is talking is a better place to arrive than whichever 1:1
  // happened to be open last. #announcements wins when it exists, since that
  // is the room a workspace puts its direction in; otherwise the first
  // channel in sidebar order.
  useEffect(() => {
    if (!channels || !conversations) return;
    const known = new Set(conversations.map((conversation) => conversation.id));
    // Not "is something selected" but "is the selection real". The id is
    // restored from storage, so resetting the workspace leaves one pointing
    // at a conversation that no longer exists — non-null, and enough to keep
    // the pane on a welcome screen forever.
    if (currentConversationId !== null && known.has(currentConversationId)) {
      return;
    }
    const inOrder = (channelsByGroup.get(null) ?? []).concat(
      (groups ?? []).flatMap((group) => channelsByGroup.get(group.id) ?? []),
    );
    const landing =
      inOrder.find(
        (channel) =>
          // Contains, not equals: channel names carry an emoji, and a rename
          // is a normal thing for someone to do to their own room.
          channel.name.toLowerCase().includes("announcements") &&
          known.has(channel.conversationId),
      ) ?? inOrder.find((channel) => known.has(channel.conversationId));
    if (!landing) return;
    setCurrentConversation(landing.conversationId);
    // Landing in a channel while the sidebar still shows Chats would open a
    // room the list does not contain.
    setActiveTab("teams");
  }, [
    currentConversationId,
    channels,
    conversations,
    channelsByGroup,
    groups,
    setCurrentConversation,
    setActiveTab,
  ]);

  // Unread indicators on the INACTIVE tab, so nothing gets lost while hidden.
  const sum = (counts: number[]) => counts.reduce((a, b) => a + b, 0);
  const teamsUnread = sum(teamChannels.map(channelUnreadCount));
  const chatsUnread =
    sum(directMessages.map(channelUnreadCount)) +
    sum(plainConversations.map((c) => unreadCountFor(c.id)));

  return (
    <div className="flex h-full flex-col">
      {/* Teams | Chats — a segmented control: rounded track, raised pill. */}
      <div className="px-1 pt-1 pb-2">
        <div className="flex gap-0.5 rounded-lg bg-sidebar-accent p-0.5">
          {(
            [
              { id: "teams", label: "Teams", unread: teamsUnread },
              { id: "chats", label: "Chats", unread: chatsUnread },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex-1 rounded-md px-2 py-1.5 text-sm transition-colors pointer-events-auto",
                activeTab === tab.id
                  ? "bg-sidebar font-medium text-sidebar-foreground shadow-xs"
                  : "text-muted-foreground hover:text-sidebar-foreground",
              )}
            >
              {tab.label}
              {tab.unread > 0 && activeTab !== tab.id && (
                <span
                  className="absolute right-1 top-1/2 min-w-4 -translate-y-1/2 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
                  aria-label={`${tab.unread} unread`}
                >
                  {formatUnread(tab.unread)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <ContextMenu>
        {/* Right-clicking the empty run of sidebar below the list offers what
            can be created there, at the cursor. Channels and group headers
            have their own menus and stop the event before it reaches here. */}
        <ContextMenuTrigger asChild disabled={activeTab !== "teams"}>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
            {activeTab === "teams" && (
              <>
                {/* Every channel lives under a named heading, including the ones
                nobody filed: "General" is a real place to drag out of, where
                an unlabelled list was somewhere channels merely sat. It is
                the only heading that cannot be renamed or deleted — a channel
                with no group has to land somewhere. */}
                {(channelsByGroup.get(null)?.length ?? 0) > 0 && (
                  <GroupSection
                    group={null}
                    label="General"
                    channels={channelsByGroup.get(null) ?? []}
                    currentConversationId={currentConversationId}
                    channelUnreadCount={channelUnreadCount}
                    onSelectChannel={selectChannel}
                    drag={drag}
                    onNewGroup={() => setIsAddingGroup(true)}
                  />
                )}

                {orderedGroups.map((group) => (
                  <motion.div
                    key={group.id}
                    layout
                    transition={{
                      type: "spring",
                      stiffness: 620,
                      damping: 34,
                      mass: 0.55,
                    }}
                  >
                    <GroupSection
                      group={group}
                      label={group.name}
                      channels={channelsByGroup.get(group.id) ?? []}
                      currentConversationId={currentConversationId}
                      channelUnreadCount={channelUnreadCount}
                      onSelectChannel={selectChannel}
                      drag={drag}
                      groupDrag={groupDrag}
                      groupDragging={groupDrag.draggingId === group.id}
                      onNewGroup={() => setIsAddingGroup(true)}
                    />
                  </motion.div>
                ))}

                {!hasChannels &&
                  (isAddingFirstChannel ? (
                    <div className="px-2">
                      <InlineNameInput
                        placeholder="Channel name"
                        onSubmit={(name) => {
                          void createChannel({ name, groupId: null });
                          setIsAddingFirstChannel(false);
                        }}
                        onCancel={() => setIsAddingFirstChannel(false)}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-start gap-2 px-2 pt-6">
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Channels are rooms where you and your
                        <br />
                        agents work together.
                      </p>
                      <button
                        onClick={() => setIsAddingFirstChannel(true)}
                        className="flex items-center gap-1.5 rounded-md bg-sidebar-accent px-2.5 py-1.5 text-xs font-medium text-sidebar-accent-foreground hover:bg-sidebar-hover transition-colors pointer-events-auto"
                      >
                        <Plus size={12} />
                        <span>New channel</span>
                      </button>
                    </div>
                  ))}

                {/* Below the groups, where the new one is about to appear. Naming
                it at the top of the list meant typing in one place and
                watching the result land somewhere else. */}
                {isAddingGroup && (
                  <div className="px-2 pt-1">
                    <InlineNameInput
                      placeholder="Group name"
                      onSubmit={(name) => {
                        void createGroup(name);
                        setIsAddingGroup(false);
                      }}
                      onCancel={() => setIsAddingGroup(false)}
                    />
                  </div>
                )}

                {hasChannels && isAddingFirstChannel && (
                  <div className="px-2 pt-1">
                    <InlineNameInput
                      placeholder="Channel name"
                      onSubmit={(name) => {
                        void createChannel({ name, groupId: null });
                        setIsAddingFirstChannel(false);
                      }}
                      onCancel={() => setIsAddingFirstChannel(false)}
                    />
                  </div>
                )}
              </>
            )}

            {activeTab === "chats" && (
              <div className="space-y-1 px-1">
                <div className="flex items-center px-1">
                  <span className={`${SECTION_LABEL} flex-1`}>
                    Direct messages
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsStartingDM((open) => !open)}
                    className="rounded p-1 text-muted-foreground transition-colors pointer-events-auto hover:bg-sidebar-hover hover:text-sidebar-foreground"
                    title="Message an agent"
                    aria-label="Message an agent"
                    aria-expanded={isStartingDM}
                  >
                    <Plus size={13} />
                  </button>
                </div>

                {isStartingDM && (
                  <div className="rounded-lg bg-sidebar-accent p-1">
                    {agentsWithoutDM.length > 0 ? (
                      agentsWithoutDM.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors pointer-events-auto hover:bg-sidebar-hover"
                          onClick={() => {
                            if (!member.agentId) return;
                            void ensureAgentDM(member.agentId).then((dm) => {
                              setIsStartingDM(false);
                              select(dm.conversationId);
                            });
                          }}
                        >
                          <MemberAvatar member={member} className="size-6" />
                          <span className="min-w-0 flex-1 truncate">
                            {member.name}
                          </span>
                          <MessageCircle
                            size={13}
                            className="text-muted-foreground"
                          />
                        </button>
                      ))
                    ) : (
                      <p className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">
                        {directMessages.length > 0
                          ? "Every agent already has a direct message."
                          : "Hire an agent before starting a direct message."}
                      </p>
                    )}
                  </div>
                )}

                {directMessages.length > 0 && (
                  <div className="space-y-0.5">
                    {directMessages.map((channel) => (
                      <ChannelItem
                        key={channel.id}
                        channel={channel}
                        isActive={
                          currentConversationId === channel.conversationId
                        }
                        unreadCount={channelUnreadCount(channel)}
                        onSelect={() => selectChannel(channel)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeTab === "chats" && plainConversations.length > 0 && (
              <div className="px-2 pt-2">
                <span className={SECTION_LABEL}>Recent</span>
              </div>
            )}
            {activeTab === "chats" &&
              (plainConversations.length > 0 ? (
                <div className="space-y-0.5 px-1">
                  {plainConversations.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      isActive={currentConversationId === conversation.id}
                      unreadCount={unreadCountFor(conversation.id)}
                      onSelect={() => select(conversation.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-start gap-2 px-2 pt-4">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Quick chats with Convera,
                    <br />
                    your assistant.
                  </p>
                  <button
                    onClick={onNewChat}
                    className="flex items-center gap-1.5 rounded-md bg-sidebar-accent px-2.5 py-1.5 text-xs font-medium text-sidebar-accent-foreground hover:bg-sidebar-hover transition-colors pointer-events-auto"
                  >
                    <Plus size={12} />
                    <span>New chat</span>
                  </button>
                </div>
              ))}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setIsAddingFirstChannel(true)}>
            <Plus size={14} />
            <span>New channel</span>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setIsAddingGroup(true)}>
            <FolderPlus size={14} />
            <span>New group</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* A persistent full-width New chat button: the primary action of the
          Chats tab should not be a hover-only icon. */}
      {activeTab === "chats" && plainConversations.length > 0 && (
        <div className="px-1 pb-1 pt-2">
          <button
            onClick={onNewChat}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sidebar-accent px-2.5 py-2 text-xs font-medium text-sidebar-accent-foreground hover:bg-sidebar-hover transition-colors pointer-events-auto"
          >
            <Plus size={12} />
            <span>New chat</span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Discord-style user pill: the whole row is the one settings entry point.
 * No separate Archive/Settings menu rows in the footer.
 */
export function WorkspaceUserRow({ onClick }: { onClick?: () => void }) {
  const me = useMember(LOCAL_HUMAN_MEMBER_ID);

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-hover pointer-events-auto"
      aria-label="Open settings"
      title="Settings"
    >
      <span className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
        {me?.name.charAt(0) ?? "Y"}
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-chart-5 ring-2 ring-sidebar" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-tight text-sidebar-foreground">
          {me?.name ?? "You"}
        </span>
        <span className="block truncate text-xs leading-tight text-muted-foreground">
          Online
        </span>
      </span>
      <SettingsIcon size={14} className="flex-shrink-0 text-muted-foreground" />
    </button>
  );
}
