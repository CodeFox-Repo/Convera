/**
 * Local-environment reset actions for the dev-only floating dock.
 *
 * Kept out of the component so they can be exercised in vitest, and so the
 * whole thing stays a leaf of the import graph that a production build drops.
 */

import { db, type Conversation } from "./db";
import { ensureStarterTeam } from "./agent-templates";

export interface WorkspaceCounts {
  conversations: number;
  messages: number;
  channels: number;
  agents: number;
}

export async function readWorkspaceCounts(): Promise<WorkspaceCounts> {
  const [conversations, messages, channels, agents] = await Promise.all([
    db.conversations.count(),
    db.messages.count(),
    db.channels.count(),
    db.agents.count(),
  ]);
  return { conversations, messages, channels, agents };
}

function emptyConversation(id: string, title: string): Conversation {
  const now = new Date();
  return {
    id,
    title,
    agentId: null,
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

/** Wipes the transcript tables, keeping members, agents and channels. */
export async function clearChatHistory(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.conversations,
      db.messages,
      db.pendingTurns,
      db.pendingConversationDeletions,
      db.channels,
    ],
    async () => {
      const channels = await db.channels.toArray();
      await Promise.all([
        db.conversations.clear(),
        db.messages.clear(),
        db.pendingTurns.clear(),
        db.pendingConversationDeletions.clear(),
      ]);
      // A channel references a conversation row rather than owning messages,
      // so a bare wipe would leave every channel aimed at a dead id. Recreate
      // them empty under the same ids to keep the sidebar working.
      await db.conversations.bulkAdd(
        channels.map((channel) =>
          emptyConversation(channel.conversationId, channel.name),
        ),
      );
    },
  );
}

/**
 * Drops the whole database rather than clearing tables: only a fresh open
 * re-runs Dexie's populate hook, which is what seeds the local human member.
 * The reload is what re-triggers `ensureStarterTeam()` from a clean slate.
 */
export async function resetWorkspace(): Promise<void> {
  await db.delete();
  window.location.reload();
}

export async function reseedStarterTeam(): Promise<void> {
  await db.settings.delete("starterTeamSeeded");
  await ensureStarterTeam();
}
