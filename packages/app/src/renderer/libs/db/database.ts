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

import Dexie, { type EntityTable } from "dexie";
import {
  migrateConversationRecordToV2,
  migrateMessageRecordToV2,
} from "./database-migrations";

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

// ==================== Database Class ====================

export class ConveraDB extends Dexie {
  conversations!: EntityTable<Conversation, "id">;
  messages!: EntityTable<Message, "id">;
  agents!: EntityTable<Agent, "id">;
  modelConfigs!: EntityTable<ModelConfig, "id">;
  settings!: EntityTable<AppSetting, "key">;

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
  }
}

// Singleton instance
export const db = new ConveraDB();

// ==================== Default Data ====================

export const DEFAULT_AGENT: Agent = {
  id: "default",
  name: "Default Assistant",
  description: "The default assistant with general capabilities.",
  systemPrompt: "",
  disableToolReferences: [],
  selectedMCPs: [],
  isBuiltIn: true,
  predefined: true, // For backward compatibility
  createdAt: new Date(),
  updatedAt: new Date(),
};
