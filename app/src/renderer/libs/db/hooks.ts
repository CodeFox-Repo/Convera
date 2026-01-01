/**
 * Dexie React Hooks
 *
 * 使用 useLiveQuery 实现实时数据查询，自动多窗口同步
 * 替代 Zustand + localStorage 的复杂同步逻辑
 */

import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  type Agent,
  type Conversation,
  type Message,
  type ModelConfig,
  DEFAULT_AGENT,
  FOXYCHAT_CONFIG_ID,
  DEFAULT_FOXYCHAT_MODELS,
} from "./database";

// ==================== Conversation Hooks ====================

/**
 * 获取所有对话（按更新时间倒序）
 */
export function useConversations() {
  return useLiveQuery(() =>
    db.conversations.orderBy("updatedAt").reverse().toArray()
  );
}

/**
 * 获取单个对话
 */
export function useConversation(id: string | null) {
  return useLiveQuery(
    () => (id ? db.conversations.get(id) : undefined),
    [id]
  );
}

/**
 * 获取对话的所有消息（按创建时间排序）
 */
export function useMessages(conversationId: string | null) {
  return useLiveQuery(
    () =>
      conversationId
        ? db.messages
            .where("conversationId")
            .equals(conversationId)
            .sortBy("createdAt")
        : [],
    [conversationId]
  );
}

// ==================== Conversation Actions ====================

export async function createConversation(
  data: Partial<Omit<Conversation, "id" | "createdAt" | "updatedAt">>
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();

  await db.conversations.add({
    id,
    title: data.title ?? null,
    agentId: data.agentId ?? null,
    modelId: data.modelId ?? null,
    systemPrompt: data.systemPrompt ?? null,
    metadata: data.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

export async function updateConversation(
  id: string,
  updates: Partial<Omit<Conversation, "id" | "createdAt">>
): Promise<void> {
  await db.conversations.update(id, {
    ...updates,
    updatedAt: new Date(),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await db.transaction("rw", [db.conversations, db.messages], async () => {
    await db.messages.where("conversationId").equals(id).delete();
    await db.conversations.delete(id);
  });
}

// ==================== Message Actions ====================

export async function addMessage(
  conversationId: string,
  message: Omit<Message, "id" | "conversationId" | "createdAt">
): Promise<string> {
  const id = crypto.randomUUID();

  await db.transaction("rw", [db.messages, db.conversations], async () => {
    await db.messages.add({
      id,
      conversationId,
      ...message,
      createdAt: new Date(),
    });

    // 更新对话的 updatedAt
    await db.conversations.update(conversationId, {
      updatedAt: new Date(),
    });
  });

  return id;
}

export async function updateMessages(
  conversationId: string,
  messages: Array<Omit<Message, "conversationId" | "createdAt"> & { id: string }>
): Promise<void> {
  await db.transaction("rw", [db.messages, db.conversations], async () => {
    // 删除旧消息
    await db.messages.where("conversationId").equals(conversationId).delete();

    // 添加新消息
    const now = new Date();
    await db.messages.bulkAdd(
      messages.map((msg) => ({
        ...msg,
        conversationId,
        createdAt: now,
      }))
    );

    // 更新对话的 updatedAt
    await db.conversations.update(conversationId, {
      updatedAt: now,
    });
  });
}

// ==================== Agent Hooks ====================

/**
 * 获取所有 Agent（内置 + 用户创建）
 */
export function useAgents() {
  return useLiveQuery(async () => {
    const agents = await db.agents.orderBy("updatedAt").reverse().toArray();
    // 确保默认 Agent 始终存在
    const hasDefault = agents.some((a) => a.id === DEFAULT_AGENT.id);
    if (!hasDefault) {
      return [DEFAULT_AGENT, ...agents];
    }
    // 把默认 Agent 放到最前面
    return [
      agents.find((a) => a.id === DEFAULT_AGENT.id)!,
      ...agents.filter((a) => a.id !== DEFAULT_AGENT.id),
    ];
  });
}

/**
 * 获取单个 Agent
 */
export function useAgent(id: string | null) {
  return useLiveQuery(
    () => {
      if (!id) return undefined;
      if (id === DEFAULT_AGENT.id || id === "") return DEFAULT_AGENT;
      return db.agents.get(id);
    },
    [id]
  );
}

// ==================== Agent Actions ====================

export async function createAgent(
  data: Omit<Agent, "id" | "createdAt" | "updatedAt" | "isBuiltIn" | "predefined">
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();

  await db.agents.add({
    ...data,
    id,
    isBuiltIn: false,
    predefined: false,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

export async function updateAgent(
  id: string,
  updates: Partial<Omit<Agent, "id" | "createdAt" | "isBuiltIn">>
): Promise<void> {
  if (id === DEFAULT_AGENT.id || id === "") {
    // 不能更新内置 Agent
    return;
  }
  await db.agents.update(id, {
    ...updates,
    updatedAt: new Date(),
  });
}

export async function deleteAgent(id: string): Promise<void> {
  if (id === DEFAULT_AGENT.id || id === "") {
    // 不能删除内置 Agent
    return;
  }
  await db.agents.delete(id);
}

// ==================== Model Config Hooks ====================

/**
 * 获取所有模型配置
 */
export function useModelConfigs() {
  return useLiveQuery(() => db.modelConfigs.toArray());
}

/**
 * 获取单个模型配置
 */
export function useModelConfig(id: string | null) {
  return useLiveQuery(
    () => (id && id !== FOXYCHAT_CONFIG_ID ? db.modelConfigs.get(id) : undefined),
    [id]
  );
}

// ==================== Model Config Actions ====================

export async function createModelConfig(
  data: Omit<ModelConfig, "id">
): Promise<string> {
  const id = `config-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  await db.modelConfigs.add({
    ...data,
    id,
  });

  return id;
}

export async function updateModelConfig(
  id: string,
  updates: Partial<Omit<ModelConfig, "id">>
): Promise<void> {
  await db.modelConfigs.update(id, updates);
}

export async function deleteModelConfig(id: string): Promise<void> {
  await db.modelConfigs.delete(id);
}

// ==================== Settings Hooks ====================

/**
 * 获取单个设置
 */
export function useSetting<T>(key: string, defaultValue: T): T {
  const setting = useLiveQuery(() => db.settings.get(key), [key]);
  return (setting?.value as T) ?? defaultValue;
}

/**
 * 获取所有设置
 */
export function useSettings() {
  return useLiveQuery(() => db.settings.toArray());
}

// ==================== Settings Actions ====================

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({
    key,
    value,
    updatedAt: new Date(),
  });
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const setting = await db.settings.get(key);
  return setting?.value as T | undefined;
}

// ==================== Helper: Available Models ====================

interface GroupedModel {
  configId: string;
  configName: string;
  modelId: string;
  isRemote: boolean;
}

export function useAvailableModels(isUserLoggedIn: boolean): GroupedModel[] {
  const configs = useModelConfigs();

  if (!configs) return [];

  const models: GroupedModel[] = [];

  // Foxychat 远程模型（需登录）
  if (isUserLoggedIn) {
    DEFAULT_FOXYCHAT_MODELS.forEach((modelId) => {
      models.push({
        configId: FOXYCHAT_CONFIG_ID,
        configName: "Foxychat",
        modelId,
        isRemote: true,
      });
    });
  }

  // 用户自定义模型
  configs.forEach((config) => {
    config.models.forEach((modelId) => {
      models.push({
        configId: config.id,
        configName: config.name,
        modelId,
        isRemote: false,
      });
    });
  });

  return models;
}

// ==================== 数据库初始化 ====================

/**
 * 初始化数据库，确保默认 Agent 存在
 */
export async function initializeDatabase(): Promise<void> {
  const defaultAgent = await db.agents.get(DEFAULT_AGENT.id);
  if (!defaultAgent) {
    await db.agents.add(DEFAULT_AGENT);
  }
}

// 自动初始化
initializeDatabase().catch(console.error);
