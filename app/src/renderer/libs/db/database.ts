/**
 * Dexie Database Definition
 *
 * 本地优先存储架构：
 * - conversations + messages: 聊天记录 (纯本地)
 * - agents: 用户创建的 Agent (纯本地)
 * - modelConfigs: 自定义模型配置 (纯本地)
 * - settings: 应用设置 (纯本地)
 *
 * 云端仅保留：
 * - /api/chat/completion: AI 推理
 * - /api/marketplace/*: Agent/MCP 模板下载 (未来)
 */

import Dexie, { type EntityTable } from "dexie";

// ==================== 数据模型 ====================

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
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolInvocations?: unknown[];
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
  }
}

// Singleton instance
export const db = new ConveraDB();

// ==================== 默认数据 ====================

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

// Foxychat 远程模型 (登录后可用)
export const DEFAULT_FOXYCHAT_MODELS = [
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "qwen/qwq-32b",
  "anthropic/claude-3.7-sonnet",
  "openai/o3-mini",
];

export const FOXYCHAT_CONFIG_ID = "foxychat-remote";
