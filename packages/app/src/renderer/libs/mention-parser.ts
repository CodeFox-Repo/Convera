import type { Member } from "@/shared/types/workspace";

/**
 * Resolves `@Name` out of raw message text against a channel's members.
 *
 * Two things make this more than a regex: member names contain spaces
 * ("@Maya Chen"), so the longest matching name wins rather than the first
 * word; and text inside backticks is code, where `@Fizz` is a literal the
 * author typed on purpose and must not page anybody.
 */

export interface MentionSpan {
  /** Offset of the `@` within the source text. */
  offset: number;
  /** Length of the whole `@Name` run. */
  length: number;
  memberId: string;
  name: string;
}

/** Fenced blocks first, then inline spans — order matters inside one alternation. */
const CODE_REGIONS = /```[\s\S]*?```|`[^`\n]*`/g;

function codeRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const match of text.matchAll(CODE_REGIONS)) {
    const start = match.index ?? 0;
    ranges.push([start, start + match[0].length]);
  }
  return ranges;
}

/** A mention must not run out of a word: rules out emails and `@Fizzy` for "Fizz". */
function isBoundary(char: string | undefined): boolean {
  return char === undefined || !/[\w@]/.test(char);
}

export function findMentionSpans(
  text: string,
  members: Member[],
): MentionSpan[] {
  // Longest first so "@Maya Chen" never settles for a member called "Maya".
  const candidates = [...members].sort((a, b) => b.name.length - a.name.length);
  const skip = codeRanges(text);
  const spans: MentionSpan[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "@") continue;
    if (!isBoundary(text[index - 1])) continue;
    if (skip.some(([start, end]) => index >= start && index < end)) continue;

    const match = candidates.find((member) => {
      const end = index + 1 + member.name.length;
      const slice = text.slice(index + 1, end);
      return (
        slice.toLowerCase() === member.name.toLowerCase() &&
        isBoundary(text[end])
      );
    });
    if (!match) continue;

    spans.push({
      offset: index,
      length: match.name.length + 1,
      memberId: match.id,
      name: match.name,
    });
    index += match.name.length;
  }

  return spans;
}

/** Mentioned member ids, in first-appearance order, deduped. */
export function parseMentions(text: string, members: Member[]): string[] {
  return [
    ...new Set(findMentionSpans(text, members).map((span) => span.memberId)),
  ];
}

export interface MentionQuery {
  /** Offset of the `@` that opened the query. */
  start: number;
  /** Text typed after the `@`, may be empty. */
  query: string;
}

/**
 * The in-progress mention at the caret, for driving the autocomplete popup.
 *
 * A space only stays part of the query while some member name still starts
 * with it — otherwise typing a sentence after a stray `@` would hold the popup
 * open forever.
 */
export function activeMentionQuery(
  text: string,
  caret: number,
  members: Member[],
): MentionQuery | null {
  for (let index = caret - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (char === "\n" || char === "`") return null;
    if (char !== "@") continue;
    if (!isBoundary(text[index - 1])) return null;

    const query = text.slice(index + 1, caret);
    if (query.includes(" ") && !membersMatching(query, members).length) {
      return null;
    }
    return { start: index, query };
  }
  return null;
}

/** Members whose name starts with `query` (case-insensitive); all of them when empty. */
export function membersMatching(query: string, members: Member[]): Member[] {
  const needle = query.toLowerCase();
  return members.filter((member) =>
    member.name.toLowerCase().startsWith(needle),
  );
}
