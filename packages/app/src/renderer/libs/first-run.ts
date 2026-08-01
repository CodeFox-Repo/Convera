/**
 * What a workspace says to someone standing in a room for the first time.
 *
 * A seeded workspace hands you five rooms and three colleagues and no idea
 * that any of them will answer. The example prompts are the cheapest way to
 * teach the two mechanics that matter — `@Name` addresses one colleague, a
 * bare message opens the floor — because they are real messages you can send
 * rather than a paragraph about sending messages.
 */

interface RoomPrompts {
  /** How the specialist in this room is usually addressed. */
  mention: (agentName: string) => string;
  /** Messages addressed to nobody: whoever the room's default responder is.  */
  bare: string[];
}

/**
 * Matched by substring, not equality: starter names carry an emoji
 * ("📣 announcements"), and renaming your own room is a normal thing to do —
 * the same rule the sidebar's landing channel uses.
 */
const ROOM_PROMPTS: Array<RoomPrompts & { match: string }> = [
  {
    match: "announcements",
    mention: (name) => `@${name} what kind of work should I send your way?`,
    bare: ["Hi everyone — introduce yourselves."],
  },
  {
    match: "code-review",
    mention: (name) => `@${name} review this diff:`,
    bare: ["Is this change safe to ship?"],
  },
  {
    match: "debugging",
    mention: (name) =>
      `@${name} this throws on an empty list — where do I start?`,
    bare: ["How would you reproduce this?"],
  },
  {
    match: "docs",
    mention: (name) => `@${name} turn this into steps someone can follow:`,
    bare: ["Who is this page for?"],
  },
  {
    match: "general",
    mention: (name) => `@${name} what are you best at?`,
    bare: ["Hi everyone — anyone may answer."],
  },
];

/** A room somebody made themselves still has the same two mechanics. */
const ANY_ROOM: RoomPrompts = {
  mention: (name) => `@${name} can you take a look at this?`,
  bare: ["Hi everyone — anyone here may answer."],
};

export interface ChannelPromptsInput {
  channelName: string;
  /** Agent members present, in roster order. The focused rooms list their specialist first. */
  agentNames: string[];
}

/**
 * Two example messages for an empty room: one addressed to a colleague by
 * name, one addressed to nobody. The mention is dropped when the room has no
 * agents in it — a prompt naming somebody who is not here teaches a name that
 * will not resolve.
 */
export function composeChannelPrompts({
  channelName,
  agentNames,
}: ChannelPromptsInput): string[] {
  const lower = channelName.toLowerCase();
  const room =
    ROOM_PROMPTS.find((entry) => lower.includes(entry.match)) ?? ANY_ROOM;
  const first = agentNames[0];
  return [...(first ? [room.mention(first)] : []), ...room.bare];
}

const MENTION_HINT_KEY = "convera.mention-hint-dismissed";

/**
 * Read through `window`, not the bare global: node-env tests import this
 * module without a DOM, and Node 22 defines a bare `localStorage` that only
 * throws a warning and hands back undefined.
 */
function storage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

/**
 * True once the user has closed the composer hint — and also when there is no
 * storage to remember the dismissal in, because a hint that cannot be
 * dismissed for good is worse than one that never showed.
 */
export function isMentionHintDismissed(): boolean {
  try {
    const store = storage();
    return !store || store.getItem(MENTION_HINT_KEY) === "1";
  } catch {
    return true;
  }
}

export function dismissMentionHint(): void {
  try {
    storage()?.setItem(MENTION_HINT_KEY, "1");
  } catch {
    // A private-mode quota error is not worth breaking a dismiss click over;
    // the hint closes for this session either way.
  }
}
