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

import type {
  Channel,
  Group,
  Member,
  Tag,
  Workspace,
} from "@/shared/types/workspace";
import { ADMIN_TAG, TAG_PERMISSIONS } from "@/shared/types/workspace";
import type { AgentTrace } from "../agent-trace";
import Dexie, { type EntityTable, type Transaction } from "dexie";
import {
  migrateConversationRecordToV2,
  migrateMessageRecordToV2,
} from "./database-migrations";

export type { Channel, Group, Member, Tag, Workspace };

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
  /** Message.id this row directly replies to. Always belongs to this conversation. */
  replyToMessageId?: string;
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
  /** Absent when the turn was not expected to speak; see pending-turn-stage. */
  assistantMessageId?: string;
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

/**
 * A renderer-side inbox receipt for an AgentHost effect. The message remains
 * authoritative in `messages`; this row only makes response-loss retries
 * return the same message id instead of posting a duplicate.
 */
export interface AgentEffectReceipt {
  idempotencyKey: string;
  payloadHash: string;
  jobId: string;
  conversationId: string;
  messageId: string;
  createdAt: Date;
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
  /**
   * The model behind this colleague. Unset means it follows the conversation's
   * own provider selection, which is what plain chats want.
   */
  providerId?: string;
  modelId?: string;
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

/** The workspace every group and channel belongs to until more are created. */
export const LOCAL_WORKSPACE_ID = "personal";

export const LOCAL_WORKSPACE: Workspace = {
  id: LOCAL_WORKSPACE_ID,
  name: "Personal",
  icon: null,
  sortOrder: 0,
};

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
  // Whoever is running the app owns it. Without this a fresh workspace could
  // have a channel nobody — including its creator — is able to open.
  tags: [ADMIN_TAG],
};

/** Ships with every workspace; holds every permission and cannot be removed. */
export const ADMIN_TAG_ROW: Tag = {
  id: ADMIN_TAG,
  workspaceId: LOCAL_WORKSPACE_ID,
  name: ADMIN_TAG,
  description: "Full access to every channel and setting.",
  permissions: [...TAG_PERMISSIONS],
  isBuiltIn: true,
  createdAt: new Date(),
  updatedAt: new Date(),
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
  agentEffectReceipts!: EntityTable<AgentEffectReceipt, "idempotencyKey">;
  pendingConversationDeletions!: EntityTable<
    PendingConversationDeletion,
    "conversationId"
  >;
  agents!: EntityTable<Agent, "id">;
  modelConfigs!: EntityTable<ModelConfig, "id">;
  settings!: EntityTable<AppSetting, "key">;
  members!: EntityTable<Member, "id">;
  workspaces!: EntityTable<Workspace, "id">;
  groups!: EntityTable<Group, "id">;
  channels!: EntityTable<Channel, "id">;
  tags!: EntityTable<Tag, "id">;
  agentTraces!: EntityTable<AgentTrace, "id">;

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

    // v7: channels carry an explicit order so the sidebar can be dragged.
    // Existing rows get their current alphabetical position, which is what
    // they were already being displayed in.
    this.version(7)
      .stores({
        channels:
          "id, workspaceId, groupId, conversationId, updatedAt, sortOrder",
      })
      .upgrade(async (transaction) => {
        const channels = transaction.table<Channel, string>("channels");
        const byGroup = new Map<string | null, Channel[]>();
        for (const channel of await channels.toArray()) {
          const list = byGroup.get(channel.groupId);
          if (list) list.push(channel);
          else byGroup.set(channel.groupId, [channel]);
        }
        for (const list of byGroup.values()) {
          list.sort((a, b) => a.name.localeCompare(b.name));
          await Promise.all(
            list.map((channel, sortOrder) =>
              channels.update(channel.id, { sortOrder }),
            ),
          );
        }
      });

    // v8: workspaces become a real table. Groups already carried a
    // workspaceId, so the existing rows need no rewrite — only the row they
    // have always pointed at has to exist.
    this.version(8)
      .stores({ workspaces: "id, sortOrder" })
      .upgrade(async (transaction) => {
        await transaction
          .table<Workspace, string>("workspaces")
          .put(LOCAL_WORKSPACE);
      });

    // v9: tags. A channel's audience is now the tags it names rather than a
    // private flag, and the same tags decide what a member may do. Existing
    // private channels keep their exact audience by being pinned to a tag
    // held by precisely their current members — nobody gains sight of a room
    // they could not already see, which is the only safe way to migrate a
    // visibility rule.
    this.version(9)
      .stores({ tags: "id, workspaceId, name" })
      .upgrade(async (transaction) => {
        const tags = transaction.table<Tag, string>("tags");
        const members = transaction.table<Member, string>("members");
        const channels = transaction.table<Channel, string>("channels");
        const now = new Date();

        await tags.put({
          id: ADMIN_TAG,
          workspaceId: LOCAL_WORKSPACE_ID,
          name: ADMIN_TAG,
          description: "Full access to every channel and setting.",
          permissions: [...TAG_PERMISSIONS],
          isBuiltIn: true,
          createdAt: now,
          updatedAt: now,
        });
        // The person running this app is its administrator; agents are not,
        // until someone says so.
        await members
          .where("kind")
          .equals("human")
          .modify((member) => {
            member.tags = [...new Set([...(member.tags ?? []), ADMIN_TAG])];
          });

        // Everything is read first and written second. A Dexie transaction
        // commits once its microtask queue drains, so interleaving reads
        // between writes can abandon the upgrade half-done — and a failed
        // upgrade rejects `db.open()`, which silently kills every live query
        // in the app rather than just this migration.
        const [allChannels, allMembers] = await Promise.all([
          channels.toArray(),
          members.toArray(),
        ]);
        const closed = allChannels.filter(
          (channel) => channel.isPrivate && channel.kind !== "dm",
        );
        const grants = new Map<string, Set<string>>(
          allMembers.map((member) => [
            member.id,
            // The person running the app owns it; agents hold nothing until
            // someone says so.
            new Set([
              ...(member.tags ?? []),
              ...(member.kind === "human" ? [ADMIN_TAG] : []),
            ]),
          ]),
        );
        for (const channel of closed) {
          const name = `channel-${channel.id}`;
          for (const memberId of channel.memberIds) {
            grants.get(memberId)?.add(name);
          }
        }

        await Promise.all([
          ...closed.map((channel) =>
            tags.put({
              id: `channel-${channel.id}`,
              workspaceId: channel.workspaceId,
              name: `channel-${channel.id}`,
              description: `Members of #${channel.name} before tags existed.`,
              permissions: [],
              createdAt: now,
              updatedAt: now,
            }),
          ),
          ...closed.map((channel) =>
            channels.update(channel.id, {
              visibleToTags: [`channel-${channel.id}`],
            }),
          ),
          ...[...grants].map(([id, held]) =>
            members.update(id, { tags: [...held] }),
          ),
        ]);
      });

    // v10: what each turn actually did. Purely diagnostic — a turn that shows
    // as typing and then says nothing is otherwise indistinguishable from one
    // that was never asked, and both have cost real time to chase.
    this.version(10).stores({
      agentTraces: "id, conversationId, memberId, startedAt",
    });

    // v11: endpoint idempotency for AgentHost speech. A message and its
    // receipt are committed in the same Dexie transaction by agent-speech.
    this.version(11).stores({
      agentEffectReceipts:
        "idempotencyKey, jobId, conversationId, messageId, createdAt",
    });

    // A database created fresh at the latest version never runs upgrade hooks,
    // so the local human member, default workspace and built-in tag must also
    // be seeded on populate.
    this.on("populate", (tx) => {
      void tx.table<Member, string>("members").put(LOCAL_HUMAN_MEMBER);
      void tx.table<Workspace, string>("workspaces").put(LOCAL_WORKSPACE);
      void tx.table<Tag, string>("tags").put(ADMIN_TAG_ROW);
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
