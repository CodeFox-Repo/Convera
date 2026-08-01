/**
 * Tag Store - Dexie Version
 *
 * A tag is a role: it says what someone is, and a channel says which roles may
 * see it. Humans and agents carry tags from the same list — an agent is a
 * colleague, so it is governed by the same rule rather than a parallel one.
 *
 * Visibility itself is decided in exactly one place, `canViewChannel` in
 * `workspace-perception.ts`. Nothing here re-implements it.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { db, LOCAL_WORKSPACE_ID, type Member, type Tag } from "../db";
import { ADMIN_TAG, type TagPermission } from "@/shared/types/workspace";

export type { Tag };

// ==================== Hooks ====================

export function useTags(): Tag[] | undefined {
  return useLiveQuery(() => db.tags.orderBy("name").toArray());
}

/** Members holding a given tag, for "who is in this role" views. */
export function useMembersWithTag(name: string): Member[] | undefined {
  return useLiveQuery(
    () =>
      db.members
        .filter((member) => (member.tags ?? []).includes(name))
        .toArray(),
    [name],
  );
}

// ==================== Actions ====================

/** Lowercase and dash-separated, so `HR Team` and `hr-team` are one tag. */
export function normalizeTagName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export async function createTag(
  name: string,
  options: { description?: string; permissions?: TagPermission[] } = {},
): Promise<Tag | undefined> {
  const normalized = normalizeTagName(name);
  if (!normalized) return undefined;
  const existing = await db.tags.where("name").equals(normalized).first();
  if (existing) return existing;
  const now = new Date();
  const tag: Tag = {
    id: crypto.randomUUID(),
    workspaceId: LOCAL_WORKSPACE_ID,
    name: normalized,
    description: options.description,
    permissions: options.permissions ?? [],
    createdAt: now,
    updatedAt: now,
  };
  await db.tags.put(tag);
  return tag;
}

export async function setTagPermissions(
  id: string,
  permissions: TagPermission[],
): Promise<void> {
  await db.tags.update(id, { permissions, updatedAt: new Date() });
}

export async function renameTag(id: string, name: string): Promise<void> {
  const tag = await db.tags.get(id);
  const normalized = normalizeTagName(name);
  if (!tag || tag.isBuiltIn || !normalized || normalized === tag.name) return;
  await db.transaction("rw", [db.tags, db.members, db.channels], async () => {
    await db.tags.update(id, { name: normalized, updatedAt: new Date() });
    // A tag's name is what members and channels store, so a rename has to
    // rewrite both or every reference silently stops matching.
    await db.members
      .filter((member) => (member.tags ?? []).includes(tag.name))
      .modify((member) => {
        member.tags = (member.tags ?? []).map((held) =>
          held === tag.name ? normalized : held,
        );
      });
    await db.channels
      .filter((channel) => (channel.visibleToTags ?? []).includes(tag.name))
      .modify((channel) => {
        channel.visibleToTags = (channel.visibleToTags ?? []).map((required) =>
          required === tag.name ? normalized : required,
        );
      });
  });
}

/**
 * Deleting a tag opens every channel that required it, so the references go
 * too — a dangling requirement nobody can hold would lock the room forever.
 */
export async function deleteTag(id: string): Promise<void> {
  const tag = await db.tags.get(id);
  if (!tag || tag.isBuiltIn) return;
  await db.transaction("rw", [db.tags, db.members, db.channels], async () => {
    await db.tags.delete(id);
    await db.members
      .filter((member) => (member.tags ?? []).includes(tag.name))
      .modify((member) => {
        member.tags = (member.tags ?? []).filter((held) => held !== tag.name);
      });
    await db.channels
      .filter((channel) => (channel.visibleToTags ?? []).includes(tag.name))
      .modify((channel) => {
        channel.visibleToTags = (channel.visibleToTags ?? []).filter(
          (required) => required !== tag.name,
        );
      });
  });
}

/** Grants or revokes one tag on one member — humans and agents alike. */
export async function setMemberTag(
  memberId: string,
  name: string,
  held: boolean,
): Promise<void> {
  const member = await db.members.get(memberId);
  if (!member) return;
  const current = new Set(member.tags ?? []);
  if (held) current.add(name);
  else current.delete(name);
  await db.members.update(memberId, { tags: [...current] });
}

/**
 * Sets which tags may see a channel. An empty list means the whole workspace.
 *
 * Named tags are created on demand so the audience can be typed in one place
 * rather than pre-registered elsewhere first.
 */
export async function setChannelVisibility(
  channelId: string,
  tagNames: string[],
): Promise<void> {
  const normalized = [
    ...new Set(tagNames.map(normalizeTagName).filter(Boolean)),
  ];
  for (const name of normalized) await createTag(name);
  await db.channels.update(channelId, {
    visibleToTags: normalized,
    // The old flag is what pre-tag rows are read by; leaving it set would
    // keep a channel closed to exactly the people its tags just admitted.
    isPrivate: false,
    updatedAt: new Date(),
  });
}

/** True when this member's tags grant the permission. */
export async function memberHasPermission(
  memberId: string,
  permission: TagPermission,
): Promise<boolean> {
  const [member, tags] = await Promise.all([
    db.members.get(memberId),
    db.tags.toArray(),
  ]);
  const held = member?.tags ?? [];
  return tags.some(
    (tag) => held.includes(tag.name) && tag.permissions.includes(permission),
  );
}

export { ADMIN_TAG };
