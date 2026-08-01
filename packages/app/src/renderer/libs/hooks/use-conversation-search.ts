import { useState, useEffect, useCallback, useRef } from "react";
import { useConversations, getRecentMessagesForSearch } from "../db/hooks";
import { useChannels, useVisibleChannelsStrict } from "../stores/channel-store";
import {
  hiddenConversationIds,
  searchConversationsAndMessages,
  type SearchResult,
} from "../utils/conversation-search-utils";

interface UseConversationSearchReturn {
  query: string;
  setQuery: (query: string) => void;
  results: SearchResult[];
  isSearching: boolean;
  clearSearch: () => void;
}

/**
 * Hook for searching conversations and messages
 * Debounces search queries and returns highlighted results
 */
export function useConversationSearch(): UseConversationSearchReturn {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const conversations = useConversations();
  const allChannels = useChannels();
  // Strict: a failed visibility check keeps search gated rather than
  // silently searching rooms the sidebar would hide.
  const visibleChannels = useVisibleChannelsStrict();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      // Both channel lists gate visibility, so searching before they load
      // would either leak a hidden room or blank every result.
      if (
        !searchQuery.trim() ||
        !conversations ||
        !allChannels ||
        !visibleChannels
      ) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);

      try {
        // A room you cannot see must not be findable by searching inside it,
        // so drop its conversation before matching rather than after.
        const hidden = hiddenConversationIds(allChannels, visibleChannels);
        const messages = await getRecentMessagesForSearch(1000);
        const searchResults = await searchConversationsAndMessages(
          searchQuery,
          conversations.filter((c) => !hidden.has(c.id)),
          messages.filter((m) => !hidden.has(m.conversationId)),
        );
        setResults(searchResults);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [conversations, allChannels, visibleChannels],
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, performSearch]);

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    setIsSearching(false);
  }, []);

  return {
    query,
    setQuery,
    results,
    isSearching,
    clearSearch,
  };
}
