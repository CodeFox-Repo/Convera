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
import {
  migrateConversationRecordToV2,
  migrateMessageRecordToV2,
} from "./database-migrations";

export type { Channel, Group, Member };

// ==================== Data Models ====================

export interface Conversation {
  id: string;
  title: string | null;
  agentId: string | null;
  modelId: string | null;
  /**
   * Renderer-visible conversation state. Native provider session identifiers
   * stay in the Electron main process; these fields only drive transcript and
   * provider selection UI.
   */
  activeRevision: number;
  activeProviderId: string | null;
  activeModelId: string | null;
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
  turnId?: string;
  revision?: number;
  providerId?: string;
  modelId?: string;
  status?: "pending" | "streaming" | "completed" | "failed" | "aborted";
  finishReason?: string;
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

export type PendingTurnJournalState =
  | "staged"
  | "accepted"
  | "transport-uncertain"
  | "committed-awaiting-ack";

export interface PendingTurnJournal {
  turnId: string;
  requestId: string;
  conversationId: string;
  operation: "append" | "bootstrap" | "rebase";
  operationReason?: "edit" | "regenerate" | "provider-switch";
  sourceMessageId?: string;
  providerId: string;
  modelId?: string;
  expectedRevision?: number;
  userMessageId?: string;
  assistantMessageId: string;
  /**
   * Ordered final transcript boundary. Message bodies and attachments remain
   * single-copy in `messages`; edit/regenerate suffix removal happens only
   * after main reports a terminal completed turn.
   */
  desiredMessageIds: string[];
  insertedMessageIds: string[];
  previousMessages: Message[];
  state: PendingTurnJournalState;
  createdAt: Date;
  updatedAt: Date;
}

export type PendingConversationDeletionState =
  | "pending"
  | "deleting"
  | "failed";

export interface PendingConversationDeletion {
  conversationId: string;
  forgetConversationMemory: boolean;
  operation?: "deletion" | "branch-cleanup";
  state: PendingConversationDeletionState;
  attempts: number;
  lastError?: string;
  retryable?: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;
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
  pendingTurns!: EntityTable<PendingTurnJournal, "turnId">;
  pendingConversationDeletions!: EntityTable<
    PendingConversationDeletion,
    "conversationId"
  >;
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

    this.version(2)
      .stores({
        conversations:
          "id, agentId, updatedAt, activeProviderId, [metadata.starred]",
        messages:
          "id, conversationId, turnId, [conversationId+turnId], createdAt",
        agents: "id, name, isBuiltIn, updatedAt",
        modelConfigs: "id, isDefault",
        settings: "key",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Conversation, string>("conversations")
          .toCollection()
          .modify(migrateConversationRecordToV2);

        await transaction
          .table<Message, string>("messages")
          .toCollection()
          .modify(migrateMessageRecordToV2);
      });

    this.version(3)
      .stores({
        conversations:
          "id, agentId, updatedAt, activeProviderId, [metadata.starred]",
        messages:
          "id, conversationId, turnId, [conversationId+turnId], createdAt",
        pendingTurns:
          "turnId, conversationId, requestId, state, createdAt, [conversationId+state]",
        agents: "id, name, isBuiltIn, updatedAt",
        modelConfigs: "id, isDefault",
        settings: "key",
      })
      .upgrade(async (transaction) => {
        // v2 could persist a pending shell but had no durable reconciliation
        // journal. Do not let those legacy markers fence a conversation
        // forever after the v3 upgrade.
        await transaction
          .table<Message, string>("messages")
          .filter((message) => message.status === "pending")
          .modify((message) => {
            message.status = "failed";
            if (message.role === "assistant") {
              message.finishReason = "interrupted-before-journal";
            }
          });
      });

    this.version(4).stores({
      conversations:
        "id, agentId, updatedAt, activeProviderId, [metadata.starred]",
      messages:
        "id, conversationId, turnId, [conversationId+turnId], createdAt",
      pendingTurns:
        "turnId, conversationId, requestId, state, createdAt, [conversationId+state]",
      pendingConversationDeletions:
        "conversationId, state, updatedAt, lastAttemptAt, nextAttemptAt",
      agents: "id, name, isBuiltIn, updatedAt",
      modelConfigs: "id, isDefault",
      settings: "key",
    });

    // v5: member identity follows the durable lifecycle schema (v2-v4).
    // Message identity fields are optional, so existing rows remain untouched.
    this.version(5)
      .stores({ members: "id, workspaceId, kind" })
      .upgrade(seedMembers);

    // v6: groups + channels for the workspace sidebar. Conversations are not
    // migrated into channels — a channel references its conversation, so
    // existing history keeps rendering through the old list untouched.
    this.version(6).stores({
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
