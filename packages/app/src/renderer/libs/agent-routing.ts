import type { Member } from "@/shared/types/workspace";
import { parseMentions } from "./mention-parser";

/**
 * Decides which agents are *given the chance* to reply to a new message.
 *
 * An explicit @mention is an address: those agents answer. With no mention the
 * message is addressed to the room, so every agent in it is offered the turn
 * and each decides for itself whether it has something worth saying — the same
 * way a person decides whether to speak up (see CLAUDE.md: agents are
 * colleagues, and the platform does not pick who talks). An agent declines by
 * replying with nothing but the pass token, which the caller drops.
 *
 * `defaultAgentMemberId` remains ONLY for 1:1 chats, where there is exactly one
 * counterpart and silence would just look broken. A channel never uses it: a
 * room does not have an assigned answerer, and posting there simply tells
 * everyone present that something was said.
 *
 * Agents can @ each other, so a single human message can start a chain. Two
 * agents mentioning each other would otherwise burn tokens forever, hence two
 * caps: at most `MAX_CHAIN_HOPS` agent messages per chain, and each agent
 * invoked at most once within a chain.
 *
 * The hop counter advances on *every* message an agent adds to the chain, not
 * only on the ones carrying a mention. Agents also get a `send_message` tool,
 * and counting mentions would let a chain of tool-posted messages run past the
 * cap — the thing the cap exists to stop.
 */

/**
 * A runaway backstop, not a conversation budget. Real work is a handoff —
 * plan, build, review, revise — and at 3 the third colleague was the last one
 * who could speak, which made the cap a rule about how much collaboration was
 * allowed rather than a guard against two agents talking forever. Colleagues
 * stop when the work is done; this only catches the ones that never would.
 */
export const MAX_CHAIN_HOPS = 20;

export interface ChainState {
  /** Messages an agent has added since the originating human message. */
  hops: number;
  /** Members already invoked in this chain, in order. */
  invoked: string[];
}

export interface RoutableMessage {
  senderId: string;
  content: string;
}

export interface RouteInput {
  message: RoutableMessage;
  members: Member[];
  /**
   * Sender of the message this one directly replies to. Explicit mentions win;
   * otherwise replying to an agent addresses that agent instead of opening the
   * floor. Resolve this from the authoritative transcript before routing.
   */
  replyToSenderId?: string | null;
  /**
   * Answers an unaddressed message. Set for 1:1 chats; leave null in channels
   * so `openFloor` decides instead.
   */
  defaultAgentMemberId?: string | null;
  /**
   * Channel semantics: an unaddressed message is offered to every agent
   * present, each of which may pass. Ignored when `defaultAgentMemberId` is set.
   */
  openFloor?: boolean;
  /** Carried over from the previous route; omit to start a fresh chain. */
  chain?: ChainState | null;
}

export interface RouteResult {
  /** Member ids to invoke, in mention order. */
  invoke: string[];
  /** Thread this back into the next call for messages produced by these agents. */
  chain: ChainState;
  /** A candidate was dropped by a cap — UI marks the thread "chain limit reached". */
  limitReached: boolean;
}

export const NEW_CHAIN: ChainState = { hops: 0, invoked: [] };

export function routeMessage({
  message,
  members,
  replyToSenderId,
  defaultAgentMemberId,
  openFloor,
  chain,
}: RouteInput): RouteResult {
  const byId = new Map(members.map((member) => [member.id, member]));
  const sender = byId.get(message.senderId);
  const fromAgent = sender?.kind === "agent";

  // A human message ends whatever came before and starts a new chain.
  const previous = fromAgent && chain ? chain : NEW_CHAIN;
  const hops = fromAgent ? previous.hops + 1 : 0;
  const next: ChainState = { hops, invoked: [...previous.invoked] };

  // An agent speaking with no chain has lost its budget, not earned a fresh
  // one. Every caller threads the chain today, so this is unreachable — but
  // the cap is the only thing standing between two agents and an endless
  // exchange, and "forgot to pass the chain" must not be the way to remove it.
  if (fromAgent && !chain) {
    return { invoke: [], chain: next, limitReached: true };
  }

  if (hops >= MAX_CHAIN_HOPS) {
    return { invoke: [], chain: next, limitReached: true };
  }

  const mentioned = parseMentions(message.content, members);
  const repliedToAgent =
    replyToSenderId && byId.get(replyToSenderId)?.kind === "agent"
      ? replyToSenderId
      : undefined;
  const openFloorCandidates = !(
    mentioned.length ||
    repliedToAgent ||
    defaultAgentMemberId
  );
  const candidates = mentioned.length
    ? mentioned
    : repliedToAgent
      ? [repliedToAgent]
      : defaultAgentMemberId
        ? [defaultAgentMemberId]
        : openFloor
          ? members.filter((member) => member.kind === "agent").map((m) => m.id)
          : [];

  // Being handed a message is not the same as being asked. An open floor
  // offers the room to everyone present, and most of them say nothing — but
  // recording all of them as invoked spent the whole chain on the opening
  // line, so a later "@Dev can you build this" was dropped in silence. Only a
  // named candidate is booked against the once-per-chain rule; `hops` still
  // bounds the exchange either way.
  const booked = !openFloorCandidates;
  const invoke: string[] = [];
  let limitReached = false;

  for (const id of candidates) {
    if (byId.get(id)?.kind !== "agent") continue;
    if (id === message.senderId) continue;
    if (next.invoked.includes(id)) {
      limitReached = true;
      continue;
    }
    invoke.push(id);
    if (booked) next.invoked.push(id);
  }

  return { invoke, chain: next, limitReached };
}
