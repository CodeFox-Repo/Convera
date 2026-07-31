import React, { useMemo, useState } from "react";
import { MessageCircle, Plus, Settings as SettingsIcon } from "lucide-react";
import { useActiveConversations } from "@/renderer/libs/db/hooks";
import {
  isUnread,
  useSelectionStore,
  useUnreadStore,
} from "@/renderer/libs/db/ui-state";
import {
  createChannel,
  createGroup,
  useChannels,
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
import { useWorkspaceUI } from "@/renderer/libs/stores/workspace-ui-context";
import { useChannelDrag } from "./use-channel-drag";

const SECTION_LABEL =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";

export function WorkspaceSidebar({ onNewChat }: { onNewChat?: () => void }) {
  const groups = useGroups();
  const channels = useChannels();
  const members = useMembers();
  const conversations = useActiveConversations();
  const { currentConversationId, setCurrentConversation } = useSelectionStore();
  const { lastSeen, markSeen } = useUnreadStore();
  const {
    sidebarTab: activeTab,
    setSidebarTab: setActiveTab,
    setView,
  } = useWorkspaceUI();
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [isAddingFirstChannel, setIsAddingFirstChannel] = useState(false);
  const [isStartingDM, setIsStartingDM] = useState(false);

  const conversationById = useMemo(
    () => new Map((conversations ?? []).map((c) => [c.id, c])),
    [conversations],
  );

  const isChannelUnread = (channel: Channel) =>
    isUnread(
      lastSeen,
      channel.conversationId,
      conversationById.get(channel.conversationId)?.updatedAt,
    );

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

  // Unread indicators on the INACTIVE tab, so nothing gets lost while hidden.
  const teamsHaveUnread = teamChannels.some(isChannelUnread);
  const chatsHaveUnread =
    directMessages.some(isChannelUnread) ||
    plainConversations.some((c) => isUnread(lastSeen, c.id, c.updatedAt));

  return (
    <div className="flex h-full flex-col">
      {/* Teams | Chats — a segmented control: rounded track, raised pill. */}
      <div className="px-1 pt-1 pb-2">
        <div className="flex gap-0.5 rounded-lg bg-sidebar-accent p-0.5">
          {(
            [
              { id: "teams", label: "Teams", unread: teamsHaveUnread },
              { id: "chats", label: "Chats", unread: chatsHaveUnread },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex-1 rounded-md px-2 py-1 text-sm transition-colors pointer-events-auto",
                activeTab === tab.id
                  ? "bg-sidebar font-medium text-sidebar-foreground shadow-xs"
                  : "text-muted-foreground hover:text-sidebar-foreground",
              )}
            >
              {tab.label}
              {tab.unread && activeTab !== tab.id && (
                <span className="absolute right-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto space-y-2"
        onContextMenu={(event) => {
          // Right-click on empty sidebar space is the create affordance, so a
          // workspace with no groups still has a way to make one.
          if (event.target !== event.currentTarget || activeTab !== "teams")
            return;
          event.preventDefault();
          setIsAddingGroup(true);
        }}
      >
        {activeTab === "teams" && (
          <>
            {isAddingGroup && (
              <div className="px-2">
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

            {/* Ungrouped first: with no groups it is the whole sidebar, and a
                lone heading over every channel is just noise. Real groups
                below always show their name — that is what a group is. */}
            {(channelsByGroup.get(null)?.length ?? 0) > 0 && (
              <GroupSection
                group={null}
                label="Channels"
                channels={channelsByGroup.get(null) ?? []}
                currentConversationId={currentConversationId}
                isChannelUnread={isChannelUnread}
                onSelectChannel={selectChannel}
                drag={drag}
                showHeader={(groups?.length ?? 0) > 0}
                onNewGroup={() => setIsAddingGroup(true)}
              />
            )}

            {(groups ?? []).map((group) => (
              <GroupSection
                key={group.id}
                group={group}
                label={group.name}
                channels={channelsByGroup.get(group.id) ?? []}
                currentConversationId={currentConversationId}
                isChannelUnread={isChannelUnread}
                onSelectChannel={selectChannel}
                drag={drag}
                onNewGroup={() => setIsAddingGroup(true)}
              />
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
          </>
        )}

        {activeTab === "chats" && (
          <div className="space-y-1 px-1">
            <div className="flex items-center px-1">
              <span className={`${SECTION_LABEL} flex-1`}>Direct messages</span>
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
                    isActive={currentConversationId === channel.conversationId}
                    isUnread={isChannelUnread(channel)}
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
                  isUnread={isUnread(
                    lastSeen,
                    conversation.id,
                    conversation.updatedAt,
                  )}
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
