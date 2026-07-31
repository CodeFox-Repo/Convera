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
}

export type WorkspaceQuery =
  | WorkspaceListChannelsQuery
  | WorkspaceReadChannelQuery
  | WorkspaceSendMessageQuery;

export interface WorkspaceChannelSummary {
  id: string;
  name: string;
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
  | { ok: false; error: { code: string; message: string } };
