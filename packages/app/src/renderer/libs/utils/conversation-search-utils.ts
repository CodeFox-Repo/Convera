import type { Channel, Conversation, Message } from "../db/database";

/** Conversation title results, then message results. Both capped. */
const MAX_CONVERSATION_RESULTS = 10;
const MAX_MESSAGE_RESULTS = 40;

/**
 * Conversation ids search must not look inside.
 *
 * A tag-hidden channel is hidden from *discovery*, not just from entry, so
 * search has to ask the same question the sidebar asks — hence visible
 * channels come from `canViewChannel` upstream rather than a second rule
 * reimplemented here. A conversation backed by no channel is a plain chat and
 * always the local user's own.
 */
export function hiddenConversationIds(
  allChannels: ReadonlyArray<Pick<Channel, "conversationId">>,
  visibleChannels: ReadonlyArray<Pick<Channel, "conversationId">>,
): Set<string> {
  const visible = new Set(
    visibleChannels.map((channel) => channel.conversationId),
  );
  const hidden = new Set<string>();
  for (const channel of allChannels) {
    if (!visible.has(channel.conversationId))
      hidden.add(channel.conversationId);
  }
  return hidden;
}

/**
 * Load and memoize a uFuzzy instance for conversation search
 */
export function loadConversationFuzzyInstance() {
  let fuzzy: unknown = null;
  let loaded = false;
  let loadingPromise: Promise<unknown> | null = null;

  const load = async (): Promise<{
    search: (
      haystack: string[],
      needle: string,
    ) => [number[], { idx: number[] }, number[]];
  }> => {
    if (loaded)
      return fuzzy as {
        search: (
          haystack: string[],
          needle: string,
        ) => [number[], { idx: number[] }, number[]];
      };
    if (loadingPromise)
      return loadingPromise as Promise<{
        search: (
          haystack: string[],
          needle: string,
        ) => [number[], { idx: number[] }, number[]];
      }>;

    loadingPromise = import("@leeoniya/ufuzzy").then((module) => {
      const uFuzzy = module.default;
      fuzzy = new uFuzzy({
        intraMode: 1,
        intraIns: 1,
        intraSub: 1,
        intraTrn: 1,
        intraDel: 1,
        interLft: 1,
        interRgt: 0,
      });
      loaded = true;
      return fuzzy as {
        search: (
          haystack: string[],
          needle: string,
        ) => [number[], { idx: number[] }, number[]];
      };
    });

    return loadingPromise as Promise<{
      search: (
        haystack: string[],
        needle: string,
      ) => [number[], { idx: number[] }, number[]];
    }>;
  };

  return { load };
}

// Singleton instance
const fuzzyInstance = loadConversationFuzzyInstance();

/**
 * Strip markdown syntax so search snippets read as plain text
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/(\*|_)(?=\S)([^*_]*\S)\1/g, "$2")
    .replace(/^>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SearchResult {
  type: "conversation" | "message";
  conversationId: string;
  conversationTitle: string | null;
  messageId?: string;
  /**
   * Member.id of the speaker, when the row carries one. The *name* is resolved
   * at render time: a member renamed after this result was computed should read
   * as who they are now, and search has no business caching identity.
   */
  senderId?: string;
  /** Falls back to `role` for rows written before senderId existed. */
  senderRole?: Message["role"];
  matchedText: string;
  updatedAt: Date;
}

/**
 * Search conversations and messages using uFuzzy
 */
export async function searchConversationsAndMessages(
  query: string,
  conversations: Conversation[],
  messages: Message[],
): Promise<SearchResult[]> {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];

  const results: SearchResult[] = [];

  try {
    const fuzzy = await fuzzyInstance.load();

    // Search conversation titles
    const titles = conversations.map((c) => c.title || "");
    const titleResult = fuzzy.search(titles, normalizedQuery);

    if (titleResult && titleResult[1]?.idx && titleResult[2]) {
      const order = titleResult[2];
      const idx = titleResult[1].idx;
      for (
        let i = 0;
        i < Math.min(order.length, MAX_CONVERSATION_RESULTS);
        i++
      ) {
        const convIndex = idx[order[i]];
        const conv = conversations[convIndex];
        if (conv && conv.title) {
          results.push({
            type: "conversation",
            conversationId: conv.id,
            conversationTitle: conv.title,
            matchedText: conv.title,
            updatedAt: conv.updatedAt,
          });
        }
      }
    }

    // Search message content
    const plainContents = messages.map((m) => stripMarkdown(m.content));
    const messageContents = plainContents.map((c) => c.slice(0, 500));
    const messageResult = fuzzy.search(messageContents, normalizedQuery);

    if (messageResult && messageResult[1]?.idx && messageResult[2]) {
      const order = messageResult[2];
      const idx = messageResult[1].idx;
      for (let i = 0; i < Math.min(order.length, MAX_MESSAGE_RESULTS); i++) {
        const msgIndex = idx[order[i]];
        const msg = messages[msgIndex];
        if (msg) {
          const conv = conversations.find((c) => c.id === msg.conversationId);
          // Extract context around the match
          const matchedText = extractMatchContext(
            plainContents[msgIndex],
            normalizedQuery,
          );
          results.push({
            type: "message",
            conversationId: msg.conversationId,
            conversationTitle: conv?.title || null,
            messageId: msg.id,
            ...(msg.senderId ? { senderId: msg.senderId } : {}),
            senderRole: msg.role,
            matchedText,
            updatedAt: msg.createdAt,
          });
        }
      }
    }
  } catch {
    // Fallback to simple substring search
    return fallbackSearch(query, conversations, messages);
  }

  return results;
}

/**
 * Fallback search using simple substring matching
 */
function fallbackSearch(
  query: string,
  conversations: Conversation[],
  messages: Message[],
): SearchResult[] {
  const normalizedQuery = query.toLowerCase().trim();
  const results: SearchResult[] = [];

  // Search conversation titles
  for (const conv of conversations.slice(0, 50)) {
    if (conv.title?.toLowerCase().includes(normalizedQuery)) {
      results.push({
        type: "conversation",
        conversationId: conv.id,
        conversationTitle: conv.title,
        matchedText: conv.title,
        updatedAt: conv.updatedAt,
      });
      if (
        results.filter((r) => r.type === "conversation").length >=
        MAX_CONVERSATION_RESULTS
      )
        break;
    }
  }

  // Search messages
  for (const msg of messages.slice(0, 500)) {
    const plain = stripMarkdown(msg.content);
    if (plain.toLowerCase().includes(normalizedQuery)) {
      const conv = conversations.find((c) => c.id === msg.conversationId);
      results.push({
        type: "message",
        conversationId: msg.conversationId,
        conversationTitle: conv?.title || null,
        messageId: msg.id,
        ...(msg.senderId ? { senderId: msg.senderId } : {}),
        senderRole: msg.role,
        matchedText: extractMatchContext(plain, normalizedQuery),
        updatedAt: msg.createdAt,
      });
      if (
        results.filter((r) => r.type === "message").length >=
        MAX_MESSAGE_RESULTS
      )
        break;
    }
  }

  return results;
}

/**
 * Extract context around a search match
 */
function extractMatchContext(
  text: string,
  query: string,
  contextLength: number = 60,
): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return (
      text.slice(0, contextLength * 2) +
      (text.length > contextLength * 2 ? "..." : "")
    );
  }

  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + query.length + contextLength);

  let result = text.slice(start, end);
  if (start > 0) result = "..." + result;
  if (end < text.length) result = result + "...";

  return result;
}

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Split text into segments with highlighted portions
 */
export function highlightSearchTerm(
  text: string,
  query: string,
): HighlightSegment[] {
  if (!query.trim()) {
    return [{ text, highlighted: false }];
  }

  const segments: HighlightSegment[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();

  let lastIndex = 0;
  let index = lowerText.indexOf(lowerQuery);

  while (index !== -1) {
    // Add non-highlighted text before match
    if (index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, index),
        highlighted: false,
      });
    }

    // Add highlighted match
    segments.push({
      text: text.slice(index, index + lowerQuery.length),
      highlighted: true,
    });

    lastIndex = index + lowerQuery.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      highlighted: false,
    });
  }

  return segments.length > 0 ? segments : [{ text, highlighted: false }];
}

/**
 * Get date group label for a date
 */
export function getDateGroup(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffMs = today.getTime() - dateDay.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This Week";
  if (diffDays < 30) return "This Month";
  return "Older";
}

/**
 * Group conversations by date
 */
export function groupConversationsByDate(
  conversations: Conversation[],
): Map<string, Conversation[]> {
  const groups = new Map<string, Conversation[]>();
  const groupOrder = ["Today", "Yesterday", "This Week", "This Month", "Older"];

  // Initialize groups in order
  for (const group of groupOrder) {
    groups.set(group, []);
  }

  for (const conv of conversations) {
    const group = getDateGroup(conv.updatedAt);
    const existing = groups.get(group) || [];
    existing.push(conv);
    groups.set(group, existing);
  }

  // Remove empty groups
  for (const group of groupOrder) {
    if (groups.get(group)?.length === 0) {
      groups.delete(group);
    }
  }

  return groups;
}
