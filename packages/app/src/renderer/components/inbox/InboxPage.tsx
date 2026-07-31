import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import type { Conversation, Message } from "@/renderer/libs/db/database";
import { LOCAL_HUMAN_MEMBER_ID, db } from "@/renderer/libs/db";
import { useActiveConversations } from "@/renderer/libs/db/hooks";
import { isUnread, useUnreadStore } from "@/renderer/libs/db/ui-state";
import { useChannels } from "@/renderer/libs/stores/channel-store";
import { useMembers } from "@/renderer/libs/stores/member-store";
import { AtSign, Hash, Inbox, MessageSquare } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import React, { useMemo } from "react";

interface InboxEntry {
  conversation: Conversation;
  channelName: string | null;
  lastMessage: Message | undefined;
  mentionsMe: boolean;
}

/**
 * Everything that changed since you last looked, one list: unread channels
 * and chats, with @-mentions of you surfaced first.
 */
export function InboxPage({
  onOpenConversation,
}: {
  onOpenConversation: (conversationId: string) => void;
}) {
  const conversations = useActiveConversations();
  const channels = useChannels();
  const members = useMembers();
  const { lastSeen, markSeen } = useUnreadStore();

  const unread = useMemo(
    () =>
      (conversations ?? []).filter((c) =>
        isUnread(lastSeen, c.id, c.updatedAt),
      ),
    [conversations, lastSeen],
  );

  const entries = useLiveQuery(async (): Promise<InboxEntry[]> => {
    const channelByConversation = new Map(
      (channels ?? []).map((c) => [c.conversationId, c.name]),
    );
    const result: InboxEntry[] = [];
    for (const conversation of unread) {
      const lastMessage = await db.messages
        .where("conversationId")
        .equals(conversation.id)
        .last();
      const seenAt = lastSeen[conversation.id] ?? 0;
      // "Mentions me" only counts messages that arrived since I last looked.
      const mentionsMe = await db.messages
        .where("conversationId")
        .equals(conversation.id)
        .filter(
          (m) =>
            m.createdAt.getTime() > seenAt &&
            (m.mentions ?? []).includes(LOCAL_HUMAN_MEMBER_ID),
        )
        .count()
        .then((n) => n > 0);
      result.push({
        conversation,
        channelName: channelByConversation.get(conversation.id) ?? null,
        lastMessage,
        mentionsMe,
      });
    }
    // Mentions first, then most recent.
    return result.sort(
      (a, b) =>
        Number(b.mentionsMe) - Number(a.mentionsMe) ||
        b.conversation.updatedAt.getTime() - a.conversation.updatedAt.getTime(),
    );
  }, [unread, channels, lastSeen]);

  const membersById = useMemo(
    () => new Map((members ?? []).map((m) => [m.id, m])),
    [members],
  );

  const open = (conversationId: string) => {
    markSeen(conversationId);
    onOpenConversation(conversationId);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-2">
        <Inbox size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
        {(entries?.length ?? 0) > 0 && (
          <span className="text-xs text-muted-foreground">
            {entries?.length} unread
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {entries && entries.length > 0 ? (
          <div className="space-y-1">
            {entries.map(
              ({ conversation, channelName, lastMessage, mentionsMe }) => {
                const sender = lastMessage?.senderId
                  ? membersById.get(lastMessage.senderId)
                  : undefined;
                return (
                  <button
                    key={conversation.id}
                    onClick={() => open(conversation.id)}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors pointer-events-auto hover:bg-muted"
                  >
                    <MemberAvatar
                      member={sender}
                      isHuman={lastMessage?.role === "user"}
                      className="mt-0.5 size-8"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {channelName ? (
                          <>
                            <Hash size={12} className="text-muted-foreground" />
                            <span className="truncate text-sm font-semibold text-foreground">
                              {channelName}
                            </span>
                          </>
                        ) : (
                          <>
                            <MessageSquare
                              size={12}
                              className="text-muted-foreground"
                            />
                            <span className="truncate text-sm font-semibold text-foreground">
                              {conversation.title ?? "Chat"}
                            </span>
                          </>
                        )}
                        {mentionsMe && (
                          <span className="flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-px text-[10px] font-medium text-primary-foreground">
                            <AtSign size={9} />
                            you
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {sender ? `${sender.name}: ` : ""}
                        {lastMessage?.content ?? ""}
                      </span>
                    </span>
                  </button>
                );
              },
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Inbox size={28} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              You're all caught up.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
