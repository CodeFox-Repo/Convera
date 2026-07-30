import React, { useMemo } from "react";
import { Star } from "lucide-react";
import { useActiveConversations } from "@/renderer/libs/db/hooks";
import { useSelectionStore } from "@/renderer/libs/db/ui-state";
import { groupConversationsByDate } from "@/renderer/libs/utils/conversation-search-utils";
import { ConversationItem } from "./ConversationItem";
import type { Conversation } from "@/renderer/libs/db";

export function ConversationList() {
  const conversations = useActiveConversations();
  const { currentConversationId, setCurrentConversation } = useSelectionStore();

  // Separate starred conversations from the rest
  const { starredConversations, groupedConversations } = useMemo(() => {
    if (!conversations)
      return { starredConversations: [], groupedConversations: new Map() };

    const starred = conversations.filter((c) => c.metadata?.starred);
    const nonStarred = conversations.filter((c) => !c.metadata?.starred);

    return {
      starredConversations: starred,
      groupedConversations: groupConversationsByDate(nonStarred),
    };
  }, [conversations]);

  if (!conversations) {
    return (
      <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="px-3 py-8 text-center">
        <p className="text-sm text-muted-foreground">No conversations yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Start chatting to create your first conversation
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Starred conversations section - always at top */}
      {starredConversations.length > 0 && (
        <div>
          <h3 className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Star size={12} className="text-yellow-500 fill-yellow-500" />
            Starred
          </h3>
          <div className="space-y-0.5">
            {starredConversations.map((conversation: Conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={currentConversationId === conversation.id}
                onSelect={() => setCurrentConversation(conversation.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Date-grouped conversations */}
      {Array.from(groupedConversations.entries()).map(([group, convs]) => (
        <div key={group}>
          <h3 className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {group}
          </h3>
          <div className="space-y-0.5">
            {convs.map((conversation: Conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={currentConversationId === conversation.id}
                onSelect={() => setCurrentConversation(conversation.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
