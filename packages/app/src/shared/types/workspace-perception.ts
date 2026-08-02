/**
 * The agent's eyes: a request/response protocol for looking at the workspace.
 *
 * The workspace lives in the renderer's Dexie database while agent tools run in
 * the Electron main process, so perception is a round trip. Queries travel on
 * the existing local-AI interaction channel (main asks, renderer answers), and
 * the answer comes back as a JSON string inside `LocalAIInteractionResponse.value`
 * — which is why every result here has to stay small enough to serialize into it.
 */

/** Interaction `name` carrying a workspace query. */
/** Tool name that means "an agent is composing a message" — drives the typing indicator. */
export const WORKSPACE_SEND_MESSAGE_TOOL = "send_message";

/** Workspace tools are how an agent perceives and speaks; neither is transcript content. */
export const WORKSPACE_TOOL_NAMES = new Set([
  "list_channels",
  "read_channel",
  WORKSPACE_SEND_MESSAGE_TOOL,
  "add_reaction",
]);

export const WORKSPACE_QUERY_INTERACTION = "workspace:query";

/**
 * The interaction response `value` is size-capped by the IPC layer, so a
 * channel read is trimmed until it fits rather than being rejected.
 */
export const WORKSPACE_QUERY_RESULT_BUDGET = 18_000;

export const WORKSPACE_MESSAGE_LIMIT_DEFAULT = 30;
export const WORKSPACE_MESSAGE_LIMIT_MAX = 100;
export const WORKSPACE_MESSAGE_CONTENT_MAX = 2_000;
export const WORKSPACE_REPLY_EXCERPT_MAX = 280;

export interface WorkspaceListChannelsQuery {
  kind: "list_channels";
  /** Whose eyes are looking; every result is filtered to what they may see. */
  viewerMemberId: string;
}

export interface WorkspaceReadChannelQuery {
  kind: "read_channel";
  viewerMemberId: string;
  channelId: string;
  limit: number;
}

/**
 * An agent may speak into any channel it can see, not only the one it was
 * invoked in, so writes ride the same filtered path as reads: same
 * `viewerMemberId`, same visibility gate.
 */
export interface WorkspaceSendMessageQuery {
  kind: "send_message";
  viewerMemberId: string;
  channelId: string;
  content: string;
  /** Existing message in the destination channel this directly answers. */
  replyToMessageId?: string;
  /** Renderer-owned lifecycle context; never accepted from a model tool input. */
  agentHost?: {
    jobId: string;
    /** Renderer-generated endpoint key; never accepted from model input. */
    effectId?: string;
    /** SHA-256 of the destination, author, body, and reply target. */
    payloadHash?: string;
    triggerMessageId: string;
    contextMessageIds: string[];
    chain: { hops: number; invoked: string[] };
  };
}

/**
 * Reacting is a gesture, not a message: it says "seen"/"agreed" without adding
 * a line to the room. Same visibility gate as everything else — an agent may
 * only react in a channel it can read.
 */
export interface WorkspaceAddReactionQuery {
  kind: "add_reaction";
  viewerMemberId: string;
  channelId: string;
  messageId: string;
  emoji: string;
}

/**
 * Open the private room with one colleague, creating it on first use.
 *
 * Returns the channel id to post into; it does not send anything, so deciding
 * to talk and deciding what to say stay separate steps.
 */
export interface WorkspaceOpenDMQuery {
  kind: "open_dm";
  viewerMemberId: string;
  memberId: string;
}

export type WorkspaceQuery =
  | WorkspaceListChannelsQuery
  | WorkspaceReadChannelQuery
  | WorkspaceSendMessageQuery
  | WorkspaceAddReactionQuery
  | WorkspaceOpenDMQuery;

export interface WorkspaceChannelSummary {
  id: string;
  name: string;
  /** What the room is for; absent when nobody has said. */
  description?: string;
  /** Sidebar section, so an agent can tell "Product" from "Launch Swarm". */
  group: string | null;
  channelKind: "channel" | "dm";
  isPrivate: boolean;
  /** False for a channel the viewer can see but has not been added to. */
  joined: boolean;
  memberCount: number;
}

export interface WorkspaceRosterEntry {
  memberId: string;
  name: string;
  kind: "human" | "agent";
  status: "idle" | "working" | "offline";
}

export interface WorkspaceChannelMessage {
  id: string;
  /** Null on pre-multi-agent rows that only carry a role. */
  senderId: string | null;
  senderName: string;
  content: string;
  replyTo?: {
    messageId: string;
    /** Null when the referenced row or its sender is no longer available. */
    senderId: string | null;
    senderName: string | null;
    content: string | null;
  };
  /**
   * How many messages answered this one, counted over the whole channel rather
   * than the returned window — a colleague scrolling back can see a line drew
   * a thread even when the answers are further down than they read. Absent when
   * nobody replied, so an unanswered message costs nothing in the budget.
   */
  replyCount?: number;
  /**
   * Who reacted with what, by name — the same thing a person sees hovering a
   * chip. Absent when nobody has reacted, so an unreacted message costs
   * nothing in the budget.
   */
  reactions?: { emoji: string; reactors: string[] }[];
  createdAt: string;
}

export interface WorkspaceChannelView extends WorkspaceChannelSummary {
  members: WorkspaceRosterEntry[];
  /** Oldest first, so the batch reads like a transcript. */
  messages: WorkspaceChannelMessage[];
  /** True when older messages or long bodies were dropped to fit the budget. */
  truncated: boolean;
}

export type WorkspaceQueryResult =
  | { ok: true; kind: "list_channels"; channels: WorkspaceChannelSummary[] }
  | { ok: true; kind: "read_channel"; channel: WorkspaceChannelView }
  | { ok: true; kind: "send_message"; messageId: string }
  | { ok: true; kind: "add_reaction"; messageId: string; emoji: string }
  | { ok: true; kind: "open_dm"; channelId: string; name: string }
  | { ok: false; error: { code: string; message: string } };
