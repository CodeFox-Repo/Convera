/**
 * Dexie React Hooks
 *
 * Uses useLiveQuery for real-time data queries with automatic multi-window sync.
 * Replaces the complex Zustand + localStorage sync logic.
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
 * Get all conversations (sorted by updatedAt descending)
 */
export function useConversations() {
  return useLiveQuery(() =>
    db.conversations.orderBy("updatedAt").reverse().toArray(),
  );
}

/**
 * Get a single conversation
 */
export function useConversation(id: string | null) {
  return useLiveQuery(() => (id ? db.conversations.get(id) : undefined), [id]);
}

/**
 * Get all messages for a conversation (sorted by createdAt)
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
    [conversationId],
  );
}

// ==================== Conversation Actions ====================

export async function createConversation(
  data: Partial<Omit<Conversation, "id" | "createdAt" | "updatedAt">>,
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
  updates: Partial<Omit<Conversation, "id" | "createdAt">>,
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
  message: Omit<Message, "id" | "conversationId" | "createdAt">,
): Promise<string> {
  const id = crypto.randomUUID();

  await db.transaction("rw", [db.messages, db.conversations], async () => {
    await db.messages.add({
      id,
      conversationId,
      ...message,
      createdAt: new Date(),
    });

    // Update conversation's updatedAt
    await db.conversations.update(conversationId, {
      updatedAt: new Date(),
    });
  });

  return id;
}

export async function updateMessages(
  conversationId: string,
  messages: Array<
    Omit<Message, "conversationId" | "createdAt"> & { id: string }
  >,
): Promise<void> {
  await db.transaction("rw", [db.messages, db.conversations], async () => {
    // Delete old messages
    await db.messages.where("conversationId").equals(conversationId).delete();

    // Add new messages with incremental timestamps to preserve order
    // Use bulkPut instead of bulkAdd to handle existing messages gracefully
    const baseTime = Date.now();
    await db.messages.bulkPut(
      messages.map((msg, index) => ({
        ...msg,
        conversationId,
        // Use index to ensure proper ordering
        createdAt: new Date(baseTime + index),
      })),
    );

    // Get existing conversation to preserve metadata
    const conv = await db.conversations.get(conversationId);
    const existingMetadata = conv?.metadata || {};

    // Update conversation's updatedAt and message count
    await db.conversations.update(conversationId, {
      updatedAt: new Date(),
      metadata: {
        ...existingMetadata,
        messageCount: messages.length,
      },
    });
  });
}

// ==================== Agent Hooks ====================

/**
 * Get all agents (built-in + user-created)
 */
export function useAgents() {
  return useLiveQuery(async () => {
    const agents = await db.agents.orderBy("updatedAt").reverse().toArray();
    // Ensure default agent always exists
    const hasDefault = agents.some((a) => a.id === DEFAULT_AGENT.id);
    if (!hasDefault) {
      return [DEFAULT_AGENT, ...agents];
    }
    // Put default agent first
    return [
      agents.find((a) => a.id === DEFAULT_AGENT.id)!,
      ...agents.filter((a) => a.id !== DEFAULT_AGENT.id),
    ];
  });
}

/**
 * Get a single agent
 */
export function useAgent(id: string | null) {
  return useLiveQuery(() => {
    if (!id) return undefined;
    if (id === DEFAULT_AGENT.id || id === "") return DEFAULT_AGENT;
    return db.agents.get(id);
  }, [id]);
}

// ==================== Agent Actions ====================

export async function createAgent(
  data: Omit<
    Agent,
    "id" | "createdAt" | "updatedAt" | "isBuiltIn" | "predefined"
  >,
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
  updates: Partial<Omit<Agent, "id" | "createdAt" | "isBuiltIn">>,
): Promise<void> {
  if (id === DEFAULT_AGENT.id || id === "") {
    // Cannot update built-in agent
    return;
  }
  await db.agents.update(id, {
    ...updates,
    updatedAt: new Date(),
  });
}

export async function deleteAgent(id: string): Promise<void> {
  if (id === DEFAULT_AGENT.id || id === "") {
    // Cannot delete built-in agent
    return;
  }
  await db.agents.delete(id);
}

// ==================== Model Config Hooks ====================

/**
 * Get all model configurations
 */
export function useModelConfigs() {
  return useLiveQuery(() => db.modelConfigs.toArray());
}

/**
 * Get a single model configuration
 */
export function useModelConfig(id: string | null) {
  return useLiveQuery(
    () =>
      id && id !== FOXYCHAT_CONFIG_ID ? db.modelConfigs.get(id) : undefined,
    [id],
  );
}

// ==================== Model Config Actions ====================

export async function createModelConfig(
  data: Omit<ModelConfig, "id">,
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
  updates: Partial<Omit<ModelConfig, "id">>,
): Promise<void> {
  await db.modelConfigs.update(id, updates);
}

export async function deleteModelConfig(id: string): Promise<void> {
  await db.modelConfigs.delete(id);
}

// ==================== Settings Hooks ====================

/**
 * Get a single setting
 */
export function useSetting<T>(key: string, defaultValue: T): T {
  const setting = useLiveQuery(() => db.settings.get(key), [key]);
  return (setting?.value as T) ?? defaultValue;
}

/**
 * Get all settings
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

  // Foxychat remote models (requires login)
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

  // User custom models
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

// ==================== Database Initialization ====================

/**
 * Initialize database, ensuring default agent exists
 */
export async function initializeDatabase(): Promise<void> {
  const defaultAgent = await db.agents.get(DEFAULT_AGENT.id);
  if (!defaultAgent) {
    await db.agents.add(DEFAULT_AGENT);
  }
}

// Auto-initialize
initializeDatabase().catch(console.error);
