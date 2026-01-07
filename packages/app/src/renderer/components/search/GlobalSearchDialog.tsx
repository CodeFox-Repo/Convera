import React, { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/renderer/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useSelectionStore, useSearchUIState } from "@/renderer/libs/db/ui-state";
import { useConversationSearch } from "@/renderer/libs/hooks/use-conversation-search";
import { Loader2, MessageSquare, Search } from "lucide-react";
import { HighlightedText } from "./HighlightedText";

interface GlobalSearchDialogProps {
  onConversationSelect?: (conversationId: string) => void;
}

export function GlobalSearchDialog({ onConversationSelect }: GlobalSearchDialogProps) {
  const { isSearchOpen, closeSearch } = useSearchUIState();
  const { setCurrentConversation } = useSelectionStore();
  const { query, setQuery, results, isSearching, clearSearch } =
    useConversationSearch();
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleSelect = (conversationId: string) => {
    setCurrentConversation(conversationId);
    onConversationSelect?.(conversationId);
    closeSearch();
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
          <DialogTitle>Search Conversations</DialogTitle>
          <DialogDescription>Search through your conversations and messages</DialogDescription>
        </VisuallyHidden>

        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b">
          <Search size={18} className="text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search conversations..."
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
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.conversationId}-${result.messageId || index}`}
                  onClick={() => handleSelect(result.conversationId)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors"
                >
                  <MessageSquare size={14} className="text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {result.type === "message" && result.conversationTitle && (
                      <span className="text-xs text-muted-foreground block truncate mb-0.5">
                        {result.conversationTitle}
                      </span>
                    )}
                    <HighlightedText
                      text={result.matchedText}
                      query={query}
                      className="text-sm truncate block text-muted-foreground"
                    />
                  </div>
                </button>
              ))}
            </div>
          ) : query.trim() ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Type to search...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
