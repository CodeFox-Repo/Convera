/**
 * Renderer half of the agent's eyes: answers `WorkspaceQuery` out of Dexie.
 *
 * The main process cannot reach IndexedDB, so it asks and this answers. Every
 * read funnels through `canViewChannel`, which is the single place channel
 * isolation will be implemented — no call site chooses its own visibility rule.
 */

import type {
  LocalAIInteractionResponse,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import type {
  WorkspaceChannelMessage,
  WorkspaceChannelSummary,
  WorkspaceChannelView,
  WorkspaceQuery,
  WorkspaceQueryResult,
  WorkspaceRosterEntry,
  WorkspaceSendMessageQuery,
} from "@/shared/types/workspace-perception";
import {
  WORKSPACE_MESSAGE_CONTENT_MAX,
  WORKSPACE_MESSAGE_LIMIT_MAX,
  WORKSPACE_QUERY_INTERACTION,
  WORKSPACE_QUERY_RESULT_BUDGET,
  WORKSPACE_REPLY_EXCERPT_MAX,
} from "@/shared/types/workspace-perception";
import type {
  Channel,
  Member,
  Tag,
  TagPermission,
} from "@/shared/types/workspace";
import { db, type Message } from "./db";

/**
 * Who is looking, reduced to what the visibility rule needs: the tags they
 * hold and the permissions those tags grant. Resolved once per query rather
 * than per channel, since it costs a table read.
 */
export interface Viewer {
  memberId: string;
  tags: string[];
  permissions: Set<TagPermission>;
}

/** Reads the member and their tags' permissions. Unknown tags grant nothing. */
export async function resolveViewer(memberId: string): Promise<Viewer> {
  const [member, tagRows] = await Promise.all([
    db.members.get(memberId),
    // A workspace whose tag table is unreadable — an interrupted upgrade, a
    // database from a build that predates tags — must still show its rooms.
    // Failing here took the sidebar, the roster and the typing indicator with
    // it, because every one of them hangs off this one call.
    db.tags.toArray().catch(() => [] as Tag[]),
  ]);
  const tags = member?.tags ?? [];
  const granted = new Set<TagPermission>();
  for (const row of tagRows) {
    if (!tags.includes(row.name)) continue;
    for (const permission of row.permissions) granted.add(permission);
  }
  return { memberId, tags, permissions: granted };
}

/**
 * The one visibility rule, for humans and agents alike.
 *
 * A channel with no required tags is visible to the whole workspace even
 * before joining — that is how a colleague discovers where the work is
 * happening. A channel that names tags is visible only to members holding at
 * least one of them, *whether or not they are in the room*: this governs
 * discovery, so an untagged member cannot find it by listing or by search.
 *
 * DMs stay membership-based. A private conversation is not a room with an
 * access policy, and a tag is not an invitation to read someone's mail.
 *
 * Admin is not special-cased here. It is simply the built-in tag that ships
 * holding `channel:view-all`, so any tag granted that permission behaves the
 * same way and the power is visible in the tag list rather than buried here.
 */
export function canViewChannel(viewer: Viewer, channel: Channel): boolean {
  if (channel.kind === "dm") {
    return channel.memberIds.includes(viewer.memberId);
  }
  const required = channel.visibleToTags ?? [];
  if (required.length === 0) {
    // Rows predating tags carry isPrivate and no required tags; honour it
    // rather than silently publishing a room that used to be closed.
    return channel.isPrivate
      ? channel.memberIds.includes(viewer.memberId)
      : true;
  }
  if (viewer.permissions.has("channel:view-all")) return true;
  return required.some((tag) => viewer.tags.includes(tag));
}

function summarize(
  viewerMemberId: string,
  channel: Channel,
  groupNames: Map<string, string>,
): WorkspaceChannelSummary {
  return {
    id: channel.id,
    name: channel.name,
    group: channel.groupId ? (groupNames.get(channel.groupId) ?? null) : null,
    channelKind: channel.kind,
    isPrivate: (channel.visibleToTags ?? []).length > 0 || !!channel.isPrivate,
    joined: channel.memberIds.includes(viewerMemberId),
    memberCount: channel.memberIds.length,
  };
}

function rosterEntry(member: Member): WorkspaceRosterEntry {
  return {
    memberId: member.id,
    name: member.name,
    kind: member.kind,
    status: member.status,
  };
}

function senderName(
  message: Message,
  members: Map<string, Member>,
): { senderId: string | null; senderName: string } {
  const member = message.senderId ? members.get(message.senderId) : undefined;
  if (member) return { senderId: member.id, senderName: member.name };
  return {
    senderId: message.senderId ?? null,
    senderName: message.senderId ?? message.role,
  };
}

function toChannelMessage(
  message: Message,
  members: Map<string, Member>,
  messagesById: Map<string, Message>,
): WorkspaceChannelMessage {
  const content =
    message.content.length > WORKSPACE_MESSAGE_CONTENT_MAX
      ? `${message.content.slice(0, WORKSPACE_MESSAGE_CONTENT_MAX)}…`
      : message.content;
  const parent = message.replyToMessageId
    ? messagesById.get(message.replyToMessageId)
    : undefined;
  const parentSender = parent ? senderName(parent, members) : undefined;
  const parentContent = parent?.content.replace(/\s+/g, " ").trim();
  const replyTo = message.replyToMessageId
    ? {
        messageId: message.replyToMessageId,
        senderId: parentSender?.senderId ?? null,
        senderName: parentSender?.senderName ?? null,
        content: parentContent
          ? parentContent.length > WORKSPACE_REPLY_EXCERPT_MAX
            ? `${parentContent.slice(0, WORKSPACE_REPLY_EXCERPT_MAX)}…`
            : parentContent
          : null,
      }
    : undefined;
  return {
    id: message.id,
    ...senderName(message, members),
    content,
    ...(replyTo ? { replyTo } : {}),
    createdAt: new Date(message.createdAt).toISOString(),
  };
}

function notFound(channelId: string): WorkspaceQueryResult {
  // Deliberately indistinguishable from "not visible": an agent must not be
  // able to probe for the existence of channels it cannot see.
  return {
    ok: false,
    error: {
      code: "CHANNEL_NOT_VISIBLE",
      message: `No channel ${channelId} is visible to you. Call list_channels to see where you can look.`,
    },
  };
}

async function listChannels(
  viewerMemberId: string,
): Promise<WorkspaceQueryResult> {
  const [channels, groups, viewer] = await Promise.all([
    db.channels.toArray(),
    db.groups.toArray(),
    resolveViewer(viewerMemberId),
  ]);
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const visible = channels
    .filter((channel) => canViewChannel(viewer, channel))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((channel) => summarize(viewerMemberId, channel, groupNames));

  // Same transport cap as a channel read: drop the tail rather than let an
  // oversized answer fail the whole listing.
  while (
    visible.length > 1 &&
    JSON.stringify(visible).length > WORKSPACE_QUERY_RESULT_BUDGET
  ) {
    visible.pop();
  }
  return { ok: true, kind: "list_channels", channels: visible };
}

async function readChannel(
  viewerMemberId: string,
  channelId: string,
  limit: number,
): Promise<WorkspaceQueryResult> {
  const [channel, viewer] = await Promise.all([
    db.channels.get(channelId),
    resolveViewer(viewerMemberId),
  ]);
  if (!channel || !canViewChannel(viewer, channel)) {
    return notFound(channelId);
  }

  const [groups, memberRows, transcript] = await Promise.all([
    db.groups.toArray(),
    db.members.bulkGet(channel.memberIds),
    db.messages
      .where("conversationId")
      .equals(channel.conversationId)
      .toArray(),
  ]);
  const members = new Map(
    memberRows
      .filter((member): member is Member => member !== undefined)
      .map((member) => [member.id, member]),
  );
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

  const ordered = transcript
    .filter((message) => message.role !== "system")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const messagesById = new Map(ordered.map((message) => [message.id, message]));
  const window = ordered.slice(
    -Math.min(Math.max(limit, 1), WORKSPACE_MESSAGE_LIMIT_MAX),
  );
  const messages = window.map((message) =>
    toChannelMessage(message, members, messagesById),
  );
  let truncated = window.length < ordered.length;

  const view = (): WorkspaceChannelView => ({
    ...summarize(viewerMemberId, channel, groupNames),
    members: [...members.values()].map(rosterEntry),
    messages,
    truncated,
  });
  // The transport caps the serialized answer, so drop the oldest messages
  // until it fits rather than failing the whole read.
  while (
    messages.length > 1 &&
    JSON.stringify(view()).length > WORKSPACE_QUERY_RESULT_BUDGET
  ) {
    messages.shift();
    truncated = true;
  }

  return { ok: true, kind: "read_channel", channel: view() };
}

export type WorkspaceSendMessageHandler = (
  query: WorkspaceSendMessageQuery,
) => Promise<WorkspaceQueryResult>;

let sendMessageHandler: WorkspaceSendMessageHandler | undefined;

/**
 * Writing a message has to go through the pending-turn journal, which this
 * module has no business knowing about. Visibility is still enforced here
 * before the handler runs, so a write cannot reach a channel a read could not.
 */
export function registerWorkspaceSendMessage(
  handler: WorkspaceSendMessageHandler | undefined,
): void {
  sendMessageHandler = handler;
}

async function sendMessage(
  query: WorkspaceSendMessageQuery,
): Promise<WorkspaceQueryResult> {
  const [channel, viewer] = await Promise.all([
    db.channels.get(query.channelId),
    resolveViewer(query.viewerMemberId),
  ]);
  if (!channel || !canViewChannel(viewer, channel)) {
    return notFound(query.channelId);
  }
  if (query.replyToMessageId) {
    const target = await db.messages.get(query.replyToMessageId);
    if (
      !target ||
      target.conversationId !== channel.conversationId ||
      (target.role !== "user" && target.role !== "assistant")
    ) {
      return {
        ok: false,
        error: {
          code: "REPLY_TARGET_NOT_FOUND",
          message:
            "The message being replied to is not available in that channel.",
        },
      };
    }
  }
  if (!sendMessageHandler) {
    return {
      ok: false,
      error: {
        code: "WORKSPACE_WRITE_UNAVAILABLE",
        message: "Sending is not available in this session.",
      },
    };
  }
  return sendMessageHandler(query);
}

export async function resolveWorkspaceQuery(
  query: WorkspaceQuery,
): Promise<WorkspaceQueryResult> {
  try {
    switch (query.kind) {
      case "list_channels":
        return await listChannels(query.viewerMemberId);
      case "read_channel":
        return await readChannel(
          query.viewerMemberId,
          query.channelId,
          query.limit,
        );
      case "send_message":
        return await sendMessage(query);
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "WORKSPACE_QUERY_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

type InteractionEvent = Extract<LocalAIStreamEvent, { type: "interaction" }>;

const WORKSPACE_QUERY_KINDS: ReadonlySet<string> = new Set([
  "list_channels",
  "read_channel",
  "send_message",
]);

function isWorkspaceQuery(value: unknown): value is WorkspaceQuery {
  if (typeof value !== "object" || value === null) return false;
  const query = value as Partial<WorkspaceQuery>;
  return (
    typeof query.viewerMemberId === "string" &&
    typeof query.kind === "string" &&
    WORKSPACE_QUERY_KINDS.has(query.kind)
  );
}

/**
 * Perception is the agent looking, not the agent asking permission, so these
 * interactions are answered here instead of surfacing an approval prompt.
 * Returns false for anything else, which stays on the normal user path.
 */
export function handleWorkspaceQueryInteraction(
  event: InteractionEvent,
  respond: (response: LocalAIInteractionResponse) => Promise<void>,
): boolean {
  if (event.name !== WORKSPACE_QUERY_INTERACTION) return false;
  if (!isWorkspaceQuery(event.input)) {
    void respond({
      value: JSON.stringify({
        ok: false,
        error: {
          code: "WORKSPACE_QUERY_INVALID",
          message: "The workspace query was malformed.",
        },
      } satisfies WorkspaceQueryResult),
    });
    return true;
  }

  void resolveWorkspaceQuery(event.input).then((result) =>
    respond({ value: JSON.stringify(result) }),
  );
  return true;
}
