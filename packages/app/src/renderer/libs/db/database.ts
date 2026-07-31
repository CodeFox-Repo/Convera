/**
 * Dexie Database Definition
 *
 * Local-first storage architecture:
 * - conversations + messages: Chat history (local only)
 * - agents: User-created agents (local only)
 * - modelConfigs: Custom model configurations (local only)
 * - settings: App settings (local only)
 *
 * AI inference and tools run through the Electron main process.
 */

import type { Channel, Group, Member } from "@/shared/types/workspace";
import Dexie, { type EntityTable, type Transaction } from "dexie";

export type { Channel, Group, Member };

// ==================== Data Models ====================

export interface Conversation {
  id: string;
  title: string | null;
  agentId: string | null;
  modelId: string | null;
  systemPrompt: string | null;
  metadata: {
    tags?: string[];
    archived?: boolean;
    starred?: boolean;
    messageCount?: number;
    branchedFrom?: {
      conversationId: string;
      messageIndex: number;
      createdAt: string;
    };
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  /** Member.id of the speaker. Absent on pre-multi-agent rows; fall back to `role`. */
  senderId?: string;
  /** Member.id[] mentioned in the body; drives agent routing in Phase 2. */
  mentions?: string[];
  /** emoji -> Member.id[] who reacted. Optional field, no index needed. */
  reactions?: Record<string, string[]>;
  parts?: unknown[];
  experimental_attachments?: Array<{
    url: string;
    name: string;
    contentType: string;
  }>;
  createdAt: Date;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  disableToolReferences: Array<{
    mcpName: string;
    toolName: string;
    reason?: string;
  }>;
  selectedMCPs?: string[];
  isBuiltIn: boolean;
  /** @deprecated Use isBuiltIn instead. Kept for backward compatibility */
  predefined?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelConfig {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  models: string[];
  isDefault: boolean;
}

export interface AppSetting {
  key: string;
  value: unknown;
  updatedAt: Date;
}

// ==================== Members ====================

/**
 * Single-workspace for now; the field exists so multi-workspace can arrive
 * without another migration.
 */
export const LOCAL_WORKSPACE_ID = "personal";

/** The person using this install. One human member, stable id. */
export const LOCAL_HUMAN_MEMBER_ID = "me";

/** Deterministic so a member can be ensured without querying by agentId. */
export function memberIdForAgent(agentId: string): string {
  return `agent:${agentId}`;
}

export const LOCAL_HUMAN_MEMBER: Member = {
  id: LOCAL_HUMAN_MEMBER_ID,
  workspaceId: LOCAL_WORKSPACE_ID,
  kind: "human",
  name: "You",
  avatar: null,
  agentId: null,
  status: "idle",
};

export function memberForAgent(agent: Pick<Agent, "id" | "name">): Member {
  return {
    id: memberIdForAgent(agent.id),
    workspaceId: LOCAL_WORKSPACE_ID,
    kind: "agent",
    name: agent.name,
    avatar: null,
    agentId: agent.id,
    status: "idle",
  };
}

/**
 * Gives every existing agent an identity, plus one for the local human.
 * Deliberately does NOT backfill `senderId` on old messages — the renderer
 * falls back to `role`, so touching history buys nothing and risks it.
 */
export async function seedMembers(tx: Transaction): Promise<void> {
  const members = tx.table<Member, string>("members");
  const agents = await tx.table<Agent, string>("agents").toArray();
  await members.bulkPut([LOCAL_HUMAN_MEMBER, ...agents.map(memberForAgent)]);
}

// ==================== Database Class ====================

export class ConveraDB extends Dexie {
  conversations!: EntityTable<Conversation, "id">;
  messages!: EntityTable<Message, "id">;
  agents!: EntityTable<Agent, "id">;
  modelConfigs!: EntityTable<ModelConfig, "id">;
  settings!: EntityTable<AppSetting, "key">;
  members!: EntityTable<Member, "id">;
  groups!: EntityTable<Group, "id">;
  channels!: EntityTable<Channel, "id">;

  constructor() {
    super("convera");

    this.version(1).stores({
      conversations: "id, agentId, updatedAt, [metadata.starred]",
      messages: "id, conversationId, createdAt",
      agents: "id, name, isBuiltIn, updatedAt",
      modelConfigs: "id, isDefault",
      settings: "key",
    });

    // v2: member identity. Only the new table is declared; existing stores keep
    // their v1 schema, and `senderId` / `mentions` are optional, so no existing
    // row is rewritten.
    this.version(2)
      .stores({ members: "id, workspaceId, kind" })
      .upgrade(seedMembers);

    // v3: groups + channels for the workspace sidebar. Conversations are not
    // migrated into channels — a channel references its conversation, so
    // existing history keeps rendering through the old list untouched.
    this.version(3).stores({
      groups: "id, workspaceId, sortOrder",
      channels: "id, workspaceId, groupId, conversationId, updatedAt",
    });

    // A database created fresh at the latest version never runs upgrade hooks,
    // so the local human member must also be seeded on populate.
    this.on("populate", (tx) => {
      void tx.table<Member, string>("members").put(LOCAL_HUMAN_MEMBER);
    });
  }
}

// Singleton instance
export const db = new ConveraDB();

// ==================== Default Data ====================

export const DEFAULT_AGENT: Agent = {
  id: "default",
  name: "Convera",
  description: "The default assistant with general capabilities.",
  systemPrompt: "",
  disableToolReferences: [],
  selectedMCPs: [],
  isBuiltIn: true,
  predefined: true, // For backward compatibility
  createdAt: new Date(),
  updatedAt: new Date(),
};
