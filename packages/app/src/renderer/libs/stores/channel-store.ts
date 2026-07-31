/**
 * Channel Store - Dexie Version
 *
 * Groups are sidebar sections; channels are places to talk. A channel points at
 * a conversation rather than owning its messages, so deleting a channel never
 * deletes history — the conversation simply falls back to the ungrouped list.
 */

import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  createConversation,
  LOCAL_HUMAN_MEMBER_ID,
  LOCAL_WORKSPACE_ID,
  type Channel,
  type Group,
  type Workspace,
} from "../db";

export type { Channel, Group, Workspace };

// ==================== Hooks ====================

export function useWorkspace(): Workspace | undefined {
  return useLiveQuery(() => db.workspaces.get(LOCAL_WORKSPACE_ID));
}

export async function renameWorkspace(name: string): Promise<void> {
  await db.workspaces.update(LOCAL_WORKSPACE_ID, { name });
}

export function useGroups(): Group[] | undefined {
  return useLiveQuery(() => db.groups.orderBy("sortOrder").toArray());
}

export function useChannels(): Channel[] | undefined {
  return useLiveQuery(() => db.channels.toArray());
}

export function useChannel(id: string | null | undefined): Channel | undefined {
  return useLiveQuery(() => (id ? db.channels.get(id) : undefined), [id]);
}

/** The channel a conversation is shown under, if any. Plain chats have none. */
export function useChannelByConversationId(
  conversationId: string | null | undefined,
): Channel | undefined {
  return useLiveQuery(
    () =>
      conversationId
        ? db.channels.where("conversationId").equals(conversationId).first()
        : undefined,
    [conversationId],
  );
}

// ==================== Group Actions ====================

export async function createGroup(
  name: string,
  icon: string | null = null,
): Promise<string> {
  const id = crypto.randomUUID();
  const last = await db.groups.orderBy("sortOrder").last();
  await db.groups.add({
    id,
    workspaceId: LOCAL_WORKSPACE_ID,
    name,
    icon,
    sortOrder: (last?.sortOrder ?? -1) + 1,
  });
  return id;
}

export async function renameGroup(id: string, name: string): Promise<void> {
  await db.groups.update(id, { name });
}

/** Channels survive; they just become ungrouped. */
export async function deleteGroup(id: string): Promise<void> {
  await db.transaction("rw", [db.groups, db.channels], async () => {
    await db.channels.where("groupId").equals(id).modify({ groupId: null });
    await db.groups.delete(id);
  });
}

/** `orderedIds` is the new top-to-bottom order. */
export async function reorderGroups(orderedIds: string[]): Promise<void> {
  await db.transaction("rw", db.groups, async () => {
    await Promise.all(
      orderedIds.map((id, sortOrder) => db.groups.update(id, { sortOrder })),
    );
  });
}

// ==================== Channel Actions ====================

export interface CreateChannelInput {
  name: string;
  groupId: string | null;
  /** Defaults to the local human plus `defaultAgentMemberId` when given. */
  memberIds?: string[];
  defaultAgentMemberId?: string | null;
  isPrivate?: boolean;
  kind?: Channel["kind"];
}

export async function createChannel(
  input: CreateChannelInput,
): Promise<string> {
  const defaultAgentMemberId = input.defaultAgentMemberId ?? null;
  const memberIds =
    input.memberIds ??
    [LOCAL_HUMAN_MEMBER_ID, defaultAgentMemberId].filter(
      (id): id is string => id !== null,
    );

  const conversationId = await createConversation({ title: input.name });
  const id = crypto.randomUUID();
  const now = new Date();
  // Dexie cannot index null, so an ungrouped count has to be filtered.
  const siblingCount = await db.channels
    .filter((channel) => channel.groupId === input.groupId)
    .count();

  await db.channels.add({
    id,
    workspaceId: LOCAL_WORKSPACE_ID,
    groupId: input.groupId,
    name: input.name,
    kind: input.kind ?? "channel",
    isPrivate: input.isPrivate ?? false,
    memberIds,
    conversationId,
    defaultAgentMemberId,
    sortOrder: siblingCount,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

/**
 * Reorder within a group, or move across groups, in one write.
 * `orderedIds` is the group's new top-to-bottom order.
 */
export async function reorderChannels(
  groupId: string | null,
  orderedIds: string[],
): Promise<void> {
  const now = new Date();
  await db.transaction("rw", db.channels, async () => {
    await Promise.all(
      orderedIds.map((id, sortOrder) =>
        db.channels.update(id, { groupId, sortOrder, updatedAt: now }),
      ),
    );
  });
}

export async function renameChannel(id: string, name: string): Promise<void> {
  await db.channels.update(id, { name, updatedAt: new Date() });
}

export async function moveChannel(
  id: string,
  groupId: string | null,
): Promise<void> {
  await db.channels.update(id, { groupId, updatedAt: new Date() });
}

/** Keeps the backing conversation: history is sacred. */
export async function deleteChannel(id: string): Promise<void> {
  await db.channels.delete(id);
}

// ==================== Roster Actions ====================

/** Joining a channel is what makes a member @-mentionable in it. */
export async function addChannelMember(
  channelId: string,
  memberId: string,
): Promise<void> {
  await db.transaction("rw", db.channels, async () => {
    const channel = await db.channels.get(channelId);
    if (!channel || channel.memberIds.includes(memberId)) return;
    await db.channels.update(channelId, {
      memberIds: [...channel.memberIds, memberId],
      updatedAt: new Date(),
    });
  });
}

/**
 * The local human is the one member a channel cannot lose — removing them
 * would leave a room nobody can speak in. Dropping the default responder
 * clears that slot too, so the channel never points at an absent agent.
 */
export async function removeChannelMember(
  channelId: string,
  memberId: string,
): Promise<void> {
  if (memberId === LOCAL_HUMAN_MEMBER_ID) return;
  await db.transaction("rw", db.channels, async () => {
    const channel = await db.channels.get(channelId);
    if (!channel) return;
    await db.channels.update(channelId, {
      memberIds: channel.memberIds.filter((id) => id !== memberId),
      defaultAgentMemberId:
        channel.defaultAgentMemberId === memberId
          ? null
          : channel.defaultAgentMemberId,
      updatedAt: new Date(),
    });
  });
}

/** Who replies when a message mentions nobody. */
export async function setChannelDefaultAgent(
  channelId: string,
  memberId: string | null,
): Promise<void> {
  await db.channels.update(channelId, {
    defaultAgentMemberId: memberId,
    updatedAt: new Date(),
  });
}
