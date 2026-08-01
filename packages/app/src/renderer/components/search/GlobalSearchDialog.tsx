import React, { useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/renderer/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  useSelectionStore,
  useSearchUIState,
} from "@/renderer/libs/db/ui-state";
import { useConversationSearch } from "@/renderer/libs/hooks/use-conversation-search";
import {
  Hash,
  Loader2,
  Lock,
  MessageSquare,
  Search,
  SearchX,
} from "lucide-react";
import { HighlightedText } from "./HighlightedText";
import { useMembers } from "@/renderer/libs/stores/member-store";
import { useVisibleChannels } from "@/renderer/libs/stores/channel-store";
import { resolveSenderName } from "@/renderer/libs/chat-labels";
import { revealMessage } from "@/renderer/libs/utils/reveal-message";
import { formatTimestamp } from "@/renderer/components/chat/message/chat-message";
import { LOCAL_HUMAN_MEMBER_ID } from "@/renderer/libs/db";

interface GlobalSearchDialogProps {
  onConversationSelect?: (conversationId: string) => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-2 pb-1 text-xs font-medium text-muted-foreground/70">
      {children}
    </div>
  );
}

/** A room reads as a room: # for a channel, a lock when tags gate it. */
function RoomGlyph({
  channel,
  className,
}: {
  channel?: { kind: "channel" | "dm"; visibleToTags?: string[] };
  className?: string;
}) {
  const Glyph = !channel
    ? MessageSquare
    : channel.kind === "dm"
      ? MessageSquare
      : (channel.visibleToTags ?? []).length > 0
        ? Lock
        : Hash;
  return (
    <Glyph
      size={14}
      className={`text-muted-foreground flex-shrink-0 ${className ?? ""}`}
    />
  );
}

export function GlobalSearchDialog({
  onConversationSelect,
}: GlobalSearchDialogProps) {
  const { isSearchOpen, closeSearch } = useSearchUIState();
  const { setCurrentConversation } = useSelectionStore();
  const { query, setQuery, results, isSearching, clearSearch } =
    useConversationSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  // Identity and room names are resolved here rather than baked into results,
  // so a rename shows through without re-running the search.
  const members = useMembers();
  const channels = useVisibleChannels();
  const memberNameById = useMemo(
    () => new Map((members ?? []).map((member) => [member.id, member.name])),
    [members],
  );
  const channelByConversationId = useMemo(
    () =>
      new Map(
        (channels ?? []).map((channel) => [channel.conversationId, channel]),
      ),
    [channels],
  );

  const conversationResults = results.filter(
    (result) => result.type === "conversation",
  );
  const messageResults = results.filter((result) => result.type === "message");

  // Clear search when dialog closes
  useEffect(() => {
    if (!isSearchOpen) {
      clearSearch();
    }
  }, [isSearchOpen, clearSearch]);

  // Focus input when dialog opens
  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isSearchOpen]);

  const handleSelect = (conversationId: string, messageId?: string) => {
    setCurrentConversation(conversationId);
    onConversationSelect?.(conversationId);
    closeSearch();
    // The row does not exist yet — the transcript has to load first, which
    // revealMessage waits for.
    if (messageId) revealMessage(messageId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      closeSearch();
    }
  };

  return (
    <Dialog
      open={isSearchOpen}
      onOpenChange={(open) => {
        if (!open) closeSearch();
      }}
    >
      <DialogContent
        hideClose
        className="p-0 gap-0 max-w-lg overflow-hidden top-[20%] translate-y-0 shadow-none"
        onKeyDown={handleKeyDown}
      >
        <VisuallyHidden>
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>
            Search message contents and conversation titles across every channel
            and DM you can see
          </DialogDescription>
        </VisuallyHidden>

        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b">
          <Search size={18} className="text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search messages and conversations..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-base text-foreground placeholder:text-muted-foreground caret-foreground"
          />
          <kbd className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {isSearching ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            </div>
          ) : results.length > 0 ? (
            <div className="py-1">
              {conversationResults.length > 0 && (
                <SectionLabel>Conversations</SectionLabel>
              )}
              {conversationResults.map((result) => (
                <button
                  key={`conversation-${result.conversationId}`}
                  onClick={() => handleSelect(result.conversationId)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors"
                >
                  <RoomGlyph
                    channel={channelByConversationId.get(result.conversationId)}
                  />
                  <HighlightedText
                    text={result.matchedText}
                    query={query}
                    className="flex-1 min-w-0 text-sm truncate block text-foreground"
                  />
                </button>
              ))}

              {messageResults.length > 0 && (
                <SectionLabel>Messages</SectionLabel>
              )}
              {messageResults.map((result, index) => {
                const channel = channelByConversationId.get(
                  result.conversationId,
                );
                const sender = resolveSenderName({
                  senderName: result.senderId
                    ? memberNameById.get(result.senderId)
                    : undefined,
                  isUser:
                    result.senderId === LOCAL_HUMAN_MEMBER_ID ||
                    result.senderRole === "user",
                });
                const room = channel
                  ? `${channel.kind === "dm" ? "" : "#"}${channel.name}`
                  : result.conversationTitle;

                return (
                  <button
                    key={`message-${result.messageId ?? index}`}
                    onClick={() =>
                      handleSelect(result.conversationId, result.messageId)
                    }
                    className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors"
                  >
                    <RoomGlyph channel={channel} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-foreground truncate">
                          {sender}
                        </span>
                        {room && (
                          <span className="text-xs text-muted-foreground truncate">
                            {room}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground/80 flex-shrink-0 ml-auto">
                          {formatTimestamp(result.updatedAt)}
                        </span>
                      </div>
                      <HighlightedText
                        text={result.matchedText}
                        query={query}
                        className="text-sm block text-muted-foreground line-clamp-2"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : query.trim() ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <SearchX size={24} />
              No results found
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Search size={24} />
              Type to search...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
