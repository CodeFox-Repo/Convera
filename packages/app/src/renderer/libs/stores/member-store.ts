/**
 * Member Store - Dexie Version
 *
 * Members are the unified identity for humans and agents. One agent can appear
 * as a member in many places, so the mapping is agent -> member, never the
 * other way round.
 */

import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  memberForAgent,
  memberIdForAgent,
  LOCAL_HUMAN_MEMBER,
  LOCAL_HUMAN_MEMBER_ID,
  type Agent,
  type Member,
} from "../db";

export type { Member };
export { LOCAL_HUMAN_MEMBER, LOCAL_HUMAN_MEMBER_ID, memberIdForAgent };

// ==================== Hooks ====================

export function useMembers(): Member[] | undefined {
  return useLiveQuery(() => db.members.toArray());
}

export function useMember(id: string | null | undefined): Member | undefined {
  return useLiveQuery(() => (id ? db.members.get(id) : undefined), [id]);
}

export function useMemberStore() {
  const members = useMembers();

  return {
    members: members ?? [],
    getMember: (id: string) => members?.find((member) => member.id === id),
    ensureAgentMember,
  };
}

// ==================== Actions ====================

export async function getMember(id: string): Promise<Member | undefined> {
  return db.members.get(id);
}

/**
 * Returns the member for an agent, creating it if this agent predates the
 * members table (or was created while it was not being maintained).
 */
export async function ensureAgentMember(agentId: string): Promise<Member> {
  const id = memberIdForAgent(agentId);
  const existing = await db.members.get(id);
  if (existing) return existing;

  const agent = await db.agents.get(agentId);
  const member = memberForAgent({ id: agentId, name: agent?.name ?? "Agent" });
  await db.members.put(member);
  return member;
}

export async function upsertAgentMember(agent: Agent): Promise<void> {
  await db.members.put(memberForAgent(agent));
}
