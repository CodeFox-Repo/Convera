import {
  db,
  LOCAL_HUMAN_MEMBER_ID,
  LOCAL_WORKSPACE_ID,
  memberForAgent,
  memberIdForAgent,
  useSelectionStore,
  useUnreadStore,
  type Channel,
  type Conversation,
} from "./db";

export interface AgentDirectMessage {
  channelId: string;
  conversationId: string;
}

function stablePart(value: string): string {
  return encodeURIComponent(value);
}

export function agentDMChannelId(agentId: string): string {
  return `dm:agent:${stablePart(agentId)}`;
}

export function agentDMConversationId(agentId: string): string {
  return `conversation:dm:agent:${stablePart(agentId)}`;
}

function isAgentDM(channel: Channel, agentMemberId: string): boolean {
  return (
    channel.kind === "dm" &&
    channel.memberIds.length === 2 &&
    channel.memberIds.includes(LOCAL_HUMAN_MEMBER_ID) &&
    channel.memberIds.includes(agentMemberId)
  );
}

function conversation(
  id: string,
  title: string,
  agentId: string,
  now: Date,
): Conversation {
  return {
    id,
    title,
    agentId,
    modelId: null,
    activeRevision: 0,
    activeProviderId: null,
    activeModelId: null,
    systemPrompt: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Returns the one durable direct-message room for an agent.
 *
 * The IDs are deterministic so two UI entry points cannot fork the same
 * colleague into separate histories. A pre-deterministic DM is adopted when
 * one exists, preserving history created by earlier builds.
 */
export async function ensureAgentDM(
  agentId: string,
): Promise<AgentDirectMessage> {
  const normalizedAgentId = agentId.trim();
  if (!normalizedAgentId) throw new Error("An agent id is required.");
  // The built-in assistant converses through its own many-conversation
  // section; a DM would be the same entity under a second conversation
  // model. Refused here so no UI entry point can recreate one.
  if (normalizedAgentId === "default") {
    throw new Error(
      "The built-in assistant uses its own conversations, not a direct message.",
    );
  }

  return db.transaction(
    "rw",
    [db.agents, db.members, db.channels, db.conversations],
    async () => {
      const agent = await db.agents.get(normalizedAgentId);
      if (!agent) {
        throw new Error(`Agent ${normalizedAgentId} does not exist.`);
      }

      const agentMemberId = memberIdForAgent(agent.id);
      if (!(await db.members.get(agentMemberId))) {
        await db.members.put(memberForAgent(agent));
      }

      const deterministicChannelId = agentDMChannelId(agent.id);
      const deterministic = await db.channels.get(deterministicChannelId);
      if (deterministic && !isAgentDM(deterministic, agentMemberId)) {
        throw new Error(
          `Channel ${deterministicChannelId} is not the direct message for ${agent.name}.`,
        );
      }

      const existing =
        deterministic ??
        (await db.channels
          .filter((channel) => isAgentDM(channel, agentMemberId))
          .first());
      const now = new Date();

      if (existing) {
        if (!(await db.conversations.get(existing.conversationId))) {
          await db.conversations.put(
            conversation(existing.conversationId, agent.name, agent.id, now),
          );
        }
        await db.channels.update(existing.id, {
          name: agent.name,
          isPrivate: true,
          memberIds: [LOCAL_HUMAN_MEMBER_ID, agentMemberId],
          defaultAgentMemberId: agentMemberId,
          updatedAt: now,
        });
        return {
          channelId: existing.id,
          conversationId: existing.conversationId,
        };
      }

      const conversationId = agentDMConversationId(agent.id);
      if (!(await db.conversations.get(conversationId))) {
        await db.conversations.add(
          conversation(conversationId, agent.name, agent.id, now),
        );
      }

      await db.channels.add({
        id: deterministicChannelId,
        workspaceId: LOCAL_WORKSPACE_ID,
        groupId: null,
        name: agent.name,
        kind: "dm",
        isPrivate: true,
        memberIds: [LOCAL_HUMAN_MEMBER_ID, agentMemberId],
        conversationId,
        defaultAgentMemberId: agentMemberId,
        createdAt: now,
        updatedAt: now,
      });

      return { channelId: deterministicChannelId, conversationId };
    },
  );
}

/**
 * Walk to a colleague's desk: open their one DM and stand in it.
 *
 * Selecting is deliberately here rather than in each caller — the roster, the
 * member card and the sidebar all mean the same thing by "message them", and
 * a caller that forgot `markSeen` would leave the room it just opened marked
 * unread. The view and sidebar tab stay with the component: they are React
 * context, and non-UI code has no business deciding which pane is showing.
 */
export async function openAgentDM(
  agentId: string,
): Promise<AgentDirectMessage> {
  const dm = await ensureAgentDM(agentId);
  useUnreadStore.getState().markSeen(dm.conversationId);
  useSelectionStore.getState().setCurrentConversation(dm.conversationId);
  return dm;
}
