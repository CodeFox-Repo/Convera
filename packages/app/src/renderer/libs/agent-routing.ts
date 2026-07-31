import type { Member } from "@/shared/types/workspace";
import { parseMentions } from "./mention-parser";

/**
 * Decides which agents reply to a new message.
 *
 * Mentions win; with none, the channel's default agent answers; with neither,
 * nobody does (a human-only channel is valid).
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

export const MAX_CHAIN_HOPS = 3;

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
  /** Answers when a message mentions nobody. */
  defaultAgentMemberId?: string | null;
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
  defaultAgentMemberId,
  chain,
}: RouteInput): RouteResult {
  const byId = new Map(members.map((member) => [member.id, member]));
  const sender = byId.get(message.senderId);
  const fromAgent = sender?.kind === "agent";

  // A human message ends whatever came before and starts a new chain.
  const previous = fromAgent && chain ? chain : NEW_CHAIN;
  const hops = fromAgent ? previous.hops + 1 : 0;
  const next: ChainState = { hops, invoked: [...previous.invoked] };

  if (hops >= MAX_CHAIN_HOPS) {
    return { invoke: [], chain: next, limitReached: true };
  }

  const mentioned = parseMentions(message.content, members);
  const candidates = mentioned.length
    ? mentioned
    : defaultAgentMemberId
      ? [defaultAgentMemberId]
      : [];

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
    next.invoked.push(id);
  }

  return { invoke, chain: next, limitReached };
}
