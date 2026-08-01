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
  type PendingTurnJournal,
  type PendingTurnJournalState,
  DEFAULT_AGENT,
  LOCAL_HUMAN_MEMBER_ID,
  memberForAgent,
  memberIdForAgent,
} from "./database";
import { seenAt, useUnreadStore } from "./ui-state";
import {
  DEFAULT_LOCAL_AI_MODEL_ID,
  LOCAL_AI_PROVIDER_NAMES,
  isLocalAIProviderId,
} from "../local-ai";
import {
  assertPendingTurnCanStage,
  selectPendingTurnMessages,
} from "../pending-turn-stage";

// ==================== Conversation Hooks ====================

/**
 * Get all conversations (sorted by updatedAt descending)
 */
export function useConversations() {
  return useLiveQuery(async () => {
    const [conversations, deletions] = await Promise.all([
      db.conversations.orderBy("updatedAt").reverse().toArray(),
      db.pendingConversationDeletions.toArray(),
    ]);
    const hidden = new Set(
      deletions.map((deletion) => deletion.conversationId),
    );
    return conversations.filter((conversation) => !hidden.has(conversation.id));
  });
}

/**
 * Get active (non-archived) conversations
 */
export function useActiveConversations() {
  return useLiveQuery(async () => {
    const [conversations, deletions] = await Promise.all([
      db.conversations
        .orderBy("updatedAt")
        .reverse()
        .filter((c) => !c.metadata?.archived)
        .toArray(),
      db.pendingConversationDeletions.toArray(),
    ]);
    const hidden = new Set(
      deletions.map((deletion) => deletion.conversationId),
    );
    return conversations.filter((conversation) => !hidden.has(conversation.id));
  });
}

/**
 * Get archived conversations
 */
export function useArchivedConversations() {
  return useLiveQuery(async () => {
    const [conversations, deletions] = await Promise.all([
      db.conversations
        .orderBy("updatedAt")
        .reverse()
        .filter((c) => c.metadata?.archived === true)
        .toArray(),
      db.pendingConversationDeletions.toArray(),
    ]);
    const hidden = new Set(
      deletions.map((deletion) => deletion.conversationId),
    );
    return conversations.filter((conversation) => !hidden.has(conversation.id));
  });
}

export function usePendingConversationDeletions() {
  return useLiveQuery(() =>
    db.pendingConversationDeletions.orderBy("updatedAt").reverse().toArray(),
  );
}

/**
 * Get recent messages for search (across all conversations)
 */
export async function getRecentMessagesForSearch(
  limit: number = 1000,
): Promise<Message[]> {
  const [messages, deletions] = await Promise.all([
    db.messages.orderBy("createdAt").reverse().limit(limit).toArray(),
    db.pendingConversationDeletions.toArray(),
  ]);
  const hidden = new Set(deletions.map((deletion) => deletion.conversationId));
  return messages.filter((message) => !hidden.has(message.conversationId));
}

/**
 * How many messages have arrived in each conversation since the user last
 * looked at it. Absent from the map means zero.
 *
 * One query for the whole sidebar rather than one per row: the badge is read
 * by every channel, every DM and both tab headers, and a live query per row
 * would re-run all of them on every keystroke an agent streams.
 */
export function countUnread(
  messages: ReadonlyArray<
    Pick<Message, "conversationId" | "createdAt" | "senderId" | "role">
  >,
  seenAtFor: (conversationId: string) => number,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const message of messages) {
    // Your own messages are read by definition. Rows predating multi-agent
    // identity carry no senderId, so `role` is the fallback the renderer
    // already uses everywhere else.
    const mine = message.senderId
      ? message.senderId === LOCAL_HUMAN_MEMBER_ID
      : message.role === "user";
    // Nobody reads a tool result or a system note; they are transcript
    // plumbing, and counting them makes the badge lie.
    const readable = message.role === "assistant" || message.role === "user";
    if (mine || !readable) continue;
    // ponytail: millisecond boundary. A message written in the same
    // millisecond as the mark reads as already-seen and never badges. Move to
    // a per-conversation last-read message id if that 1ms ever matters.
    if (message.createdAt.getTime() <= seenAtFor(message.conversationId)) {
      continue;
    }
    counts[message.conversationId] = (counts[message.conversationId] ?? 0) + 1;
  }
  return counts;
}

export function useUnreadCounts(): Record<string, number> {
  const { lastSeen, epoch } = useUnreadStore();
  // The oldest boundary any conversation could care about, so the index scan
  // starts there instead of at the beginning of history.
  const floor = Math.min(epoch, ...Object.values(lastSeen));
  const counts = useLiveQuery(
    async () => {
      const [messages, deletions] = await Promise.all([
        db.messages.where("createdAt").above(new Date(floor)).toArray(),
        db.pendingConversationDeletions.toArray(),
      ]);
      const hidden = new Set(
        deletions.map((deletion) => deletion.conversationId),
      );
      return countUnread(
        messages.filter((message) => !hidden.has(message.conversationId)),
        (conversationId) => seenAt({ lastSeen, epoch }, conversationId),
      );
    },
    [lastSeen, epoch, floor],
    {} as Record<string, number>,
  );
  return counts;
}

/**
 * Get a single conversation
 */
export function useConversation(id: string | null) {
  return useLiveQuery(async () => {
    if (!id || (await db.pendingConversationDeletions.get(id))) {
      return undefined;
    }
    return db.conversations.get(id);
  }, [id]);
}

/**
 * Get all messages for a conversation (sorted by createdAt)
 */
export function useMessages(conversationId: string | null) {
  return useLiveQuery(async () => {
    if (
      !conversationId ||
      (await db.pendingConversationDeletions.get(conversationId))
    ) {
      return [];
    }
    return db.messages
      .where("conversationId")
      .equals(conversationId)
      .sortBy("createdAt");
  }, [conversationId]);
}

// ==================== Conversation Actions ====================

export async function createConversation(
  data: Partial<Omit<Conversation, "id" | "createdAt" | "updatedAt">> & {
    id?: string;
  },
): Promise<string> {
  const id = data.id ?? crypto.randomUUID();
  const now = new Date();

  await db.conversations.add({
    id,
    title: data.title ?? null,
    agentId: data.agentId ?? null,
    modelId: data.modelId ?? null,
    activeRevision: data.activeRevision ?? 0,
    activeProviderId: data.activeProviderId ?? null,
    activeModelId: data.activeModelId ?? null,
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
  await db.transaction(
    "rw",
    [
      db.conversations,
      db.messages,
      db.pendingTurns,
      db.pendingConversationDeletions,
    ],
    async () => {
      await db.messages.where("conversationId").equals(id).delete();
      await db.pendingTurns.where("conversationId").equals(id).delete();
      await db.pendingConversationDeletions.delete(id);
      await db.conversations.delete(id);
    },
  );
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

export type MessageSnapshot = Omit<Message, "conversationId" | "createdAt"> & {
  id: string;
};

export interface PendingTurnMetadata {
  turnId: string;
  requestId: string;
  revision: number;
  providerId: string;
  modelId?: string;
  operation: "append" | "bootstrap" | "rebase";
  operationReason?: "edit" | "regenerate" | "provider-switch";
  sourceMessageId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
}

export type PendingTurnRollback = Pick<
  PendingTurnJournal,
  "turnId" | "insertedMessageIds" | "previousMessages"
>;

async function synchronizeMessages(
  conversationId: string,
  messages: MessageSnapshot[],
): Promise<void> {
  const existingMessages = await db.messages
    .where("conversationId")
    .equals(conversationId)
    .toArray();
  const existingById = new Map(
    existingMessages.map((message) => [message.id, message]),
  );
  const nextIds = new Set(messages.map((message) => message.id));
  const removedIds = existingMessages
    .filter((message) => !nextIds.has(message.id))
    .map((message) => message.id);

  if (removedIds.length > 0) {
    await db.messages.bulkDelete(removedIds);
  }

  const baseTime = Date.now();
  await db.messages.bulkPut(
    messages.map((message, index) => {
      const existing = existingById.get(message.id);
      return {
        ...existing,
        ...message,
        conversationId,
        turnId: message.turnId ?? existing?.turnId,
        revision: message.revision ?? existing?.revision,
        providerId: message.providerId ?? existing?.providerId,
        modelId: message.modelId ?? existing?.modelId,
        status: message.status ?? existing?.status,
        finishReason: message.finishReason ?? existing?.finishReason,
        createdAt: existing?.createdAt ?? new Date(baseTime + index),
      };
    }),
  );
}

export async function updateMessages(
  conversationId: string,
  messages: MessageSnapshot[],
): Promise<void> {
  await db.transaction("rw", [db.messages, db.conversations], async () => {
    await synchronizeMessages(conversationId, messages);
    const conversation = await db.conversations.get(conversationId);
    await db.conversations.update(conversationId, {
      updatedAt: new Date(),
      metadata: {
        ...(conversation?.metadata || {}),
        messageCount: messages.length,
      },
    });
  });
}

export async function commitCompletedTurn(
  conversationId: string,
  messages: MessageSnapshot[],
  updates: Pick<
    Conversation,
    "activeRevision" | "activeProviderId" | "activeModelId" | "modelId"
  >,
): Promise<void> {
  await db.transaction("rw", [db.messages, db.conversations], async () => {
    const conversation = await db.conversations.get(conversationId);
    if (!conversation) {
      throw new Error("Conversation disappeared before the turn was saved.");
    }
    await synchronizeMessages(conversationId, messages);
    await db.conversations.update(conversationId, {
      ...updates,
      updatedAt: new Date(),
      metadata: {
        ...(conversation.metadata || {}),
        messageCount: messages.length,
      },
    });
  });
}

/**
 * Durably records the outgoing turn before startChat crosses IPC. A renderer
 * crash can therefore recover the user's input and an explicit pending
 * assistant shell instead of silently losing the accepted action.
 */
export async function stagePendingTurn(
  conversationId: string,
  expectedMessages: MessageSnapshot[],
  pendingMessages: MessageSnapshot[],
  turn: PendingTurnMetadata,
): Promise<PendingTurnRollback> {
  return db.transaction(
    "rw",
    [
      db.messages,
      db.conversations,
      db.pendingTurns,
      db.pendingConversationDeletions,
    ],
    async () => {
      const conversation = await db.conversations.get(conversationId);
      if (!conversation) {
        throw new Error("Conversation disappeared before the turn was staged.");
      }
      if (await db.pendingConversationDeletions.get(conversationId)) {
        throw new Error("Conversation deletion is pending.");
      }
      const currentMessages = await db.messages
        .where("conversationId")
        .equals(conversationId)
        .sortBy("createdAt");
      // A turn that reserves no row writes nothing anyone else could clobber,
      // so several colleagues may be in flight at once. Turns that DO reserve
      // one still take the conversation exclusively.
      const journals = await db.pendingTurns
        .where("conversationId")
        .equals(conversationId)
        .toArray();
      const blocking = turn.assistantMessageId
        ? journals[0]
        : journals.find((journal) => journal.assistantMessageId);
      if (blocking) {
        throw new Error(
          "Conversation already has an outgoing turn awaiting reconciliation.",
        );
      }
      if (turn.assistantMessageId) {
        assertPendingTurnCanStage(currentMessages, expectedMessages);
      }
      const currentById = new Map(
        currentMessages.map((message) => [message.id, message]),
      );
      const turnMessages = selectPendingTurnMessages(pendingMessages, turn);
      const previousMessages = turnMessages.flatMap((message) => {
        const previous = currentById.get(message.id);
        return previous ? [previous] : [];
      });
      const insertedMessageIds = turnMessages
        .filter((message) => !currentById.has(message.id))
        .map((message) => message.id);
      const baseTime = Date.now();
      await db.messages.bulkPut(
        turnMessages.map((message, index) => {
          const previous = currentById.get(message.id);
          return {
            ...previous,
            ...message,
            conversationId,
            turnId: turn.turnId,
            revision: turn.revision,
            providerId: turn.providerId,
            modelId: turn.modelId,
            status: "pending" as const,
            finishReason: undefined,
            createdAt: previous?.createdAt ?? new Date(baseTime + index),
          };
        }),
      );
      const now = new Date();
      await db.pendingTurns.add({
        turnId: turn.turnId,
        requestId: turn.requestId,
        conversationId,
        operation: turn.operation,
        operationReason: turn.operationReason,
        sourceMessageId: turn.sourceMessageId,
        providerId: turn.providerId,
        modelId: turn.modelId,
        expectedRevision: turn.revision,
        userMessageId: turn.userMessageId,
        assistantMessageId: turn.assistantMessageId,
        desiredMessageIds: pendingMessages.map((message) => message.id),
        insertedMessageIds,
        previousMessages,
        state: "staged",
        createdAt: now,
        updatedAt: now,
      });
      await db.conversations.update(conversationId, {
        updatedAt: now,
        metadata: {
          ...(conversation.metadata || {}),
          messageCount: currentMessages.length + insertedMessageIds.length,
        },
      });
      return {
        turnId: turn.turnId,
        insertedMessageIds,
        previousMessages,
      };
    },
  );
}

export async function rollbackPendingTurn(
  conversationId: string,
  turnId: string,
): Promise<void> {
  await db.transaction(
    "rw",
    [db.messages, db.conversations, db.pendingTurns],
    async () => {
      const rollback = await db.pendingTurns.get(turnId);
      if (!rollback || rollback.conversationId !== conversationId) return;
      const touchedIds = [
        ...rollback.insertedMessageIds,
        ...rollback.previousMessages.map((message) => message.id),
      ];
      const current = await db.messages.bulkGet(touchedIds);
      const stillOwnedIds = new Set(
        current
          .filter(
            (message): message is Message =>
              message?.conversationId === conversationId &&
              message.turnId === rollback.turnId &&
              message.status === "pending",
          )
          .map((message) => message.id),
      );
      const insertedToDelete = rollback.insertedMessageIds.filter((messageId) =>
        stillOwnedIds.has(messageId),
      );
      if (insertedToDelete.length > 0) {
        await db.messages.bulkDelete(insertedToDelete);
      }
      const previousToRestore = rollback.previousMessages.filter((message) =>
        stillOwnedIds.has(message.id),
      );
      if (previousToRestore.length > 0) {
        await db.messages.bulkPut(previousToRestore);
      }
      const conversation = await db.conversations.get(conversationId);
      if (conversation) {
        const messageCount = await db.messages
          .where("conversationId")
          .equals(conversationId)
          .count();
        await db.conversations.update(conversationId, {
          updatedAt: new Date(),
          metadata: {
            ...(conversation.metadata || {}),
            messageCount,
          },
        });
      }
      await db.pendingTurns.delete(turnId);
    },
  );
}

export async function updatePendingTurnJournalState(
  conversationId: string,
  turnId: string,
  state: PendingTurnJournalState,
): Promise<void> {
  await db.transaction("rw", db.pendingTurns, async () => {
    const journal = await db.pendingTurns.get(turnId);
    if (!journal || journal.conversationId !== conversationId) return;
    await db.pendingTurns.update(turnId, {
      state,
      updatedAt: new Date(),
    });
  });
}

export async function failPendingTurn(
  conversationId: string,
  turnId: string,
  finishReason = "error",
): Promise<void> {
  await db.transaction("rw", [db.messages, db.conversations], async () => {
    await db.messages
      .where("[conversationId+turnId]")
      .equals([conversationId, turnId])
      .modify((message) => {
        message.status = "failed";
        if (message.role === "assistant") {
          message.finishReason = finishReason;
        }
      });
    await db.conversations.update(conversationId, {
      updatedAt: new Date(),
    });
  });
}

/**
 * Adds `memberId` to `emoji`'s reactors, or removes it if already there. The
 * emoji key disappears once nobody holds it, so an empty object never renders
 * a chip with a count of zero. No-ops on messages that are not persisted yet.
 */
export async function toggleReaction(
  messageId: string,
  emoji: string,
  memberId: string,
): Promise<void> {
  await db.transaction("rw", db.messages, async () => {
    const message = await db.messages.get(messageId);
    if (!message) return;

    const reactions = { ...(message.reactions ?? {}) };
    const reactors = reactions[emoji] ?? [];
    const next = reactors.includes(memberId)
      ? reactors.filter((id) => id !== memberId)
      : [...reactors, memberId];

    if (next.length === 0) {
      delete reactions[emoji];
    } else {
      reactions[emoji] = next;
    }

    await db.messages.update(messageId, { reactions });
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

async function syncAgentMember(agent: Pick<Agent, "id" | "name">) {
  const member = memberForAgent(agent);
  const existing = await db.members.get(member.id);
  if (!existing) {
    await db.members.put(member);
    return;
  }
  await db.members.update(member.id, {
    workspaceId: member.workspaceId,
    kind: member.kind,
    name: member.name,
    agentId: member.agentId,
  });
  // A DM row carries the agent's name as its own, and the channel header and
  // search results render that copy rather than the member. Left alone, a
  // rename leaves the old name on the room they are standing in.
  const dms = await db.channels
    .filter(
      (channel) =>
        channel.kind === "dm" &&
        channel.defaultAgentMemberId === member.id &&
        channel.name !== member.name,
    )
    .toArray();
  for (const dm of dms) {
    await db.channels.update(dm.id, {
      name: member.name,
      updatedAt: new Date(),
    });
  }
}

export async function createAgent(
  data: Omit<
    Agent,
    "id" | "createdAt" | "updatedAt" | "isBuiltIn" | "predefined"
  >,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();

  const agent: Agent = {
    ...data,
    id,
    isBuiltIn: false,
    predefined: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction("rw", [db.agents, db.members, db.channels], async () => {
    await db.agents.add(agent);
    await syncAgentMember(agent);
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
  await db.transaction("rw", [db.agents, db.members, db.channels], async () => {
    await db.agents.update(id, {
      ...updates,
      updatedAt: new Date(),
    });
    const agent = await db.agents.get(id);
    if (agent) {
      await syncAgentMember(agent);
    }
  });
}

export async function deleteAgent(id: string): Promise<void> {
  if (id === DEFAULT_AGENT.id || id === "") {
    // Cannot delete built-in agent
    return;
  }
  const memberId = memberIdForAgent(id);
  await db.transaction("rw", [db.agents, db.members, db.channels], async () => {
    await db.agents.delete(id);
    await db.members.delete(memberId);
    // Their desk goes with them. A DM whose only counterpart no longer
    // exists can never be answered, and nothing removes it: the row has no
    // rename or delete menu precisely because the relationship is supposed
    // to be durable. The conversation is left alone — history is kept the
    // same way deleteChannel keeps it, so re-hiring reopens the transcript.
    const rooms = await db.channels
      .filter((channel) => channel.memberIds.includes(memberId))
      .toArray();
    await db.channels.bulkDelete(
      rooms.filter((channel) => channel.kind === "dm").map((c) => c.id),
    );
    // Everywhere else they simply stop being in the room. Left behind, the id
    // names nobody: the roster renders one member fewer than it counts, and
    // `list_channels` reports the inflated count to every agent reading it.
    const now = new Date();
    for (const channel of rooms) {
      if (channel.kind === "dm") continue;
      await db.channels.update(channel.id, {
        memberIds: channel.memberIds.filter((id) => id !== memberId),
        defaultAgentMemberId:
          channel.defaultAgentMemberId === memberId
            ? null
            : channel.defaultAgentMemberId,
        updatedAt: now,
      });
    }
  });
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
      id && !isLocalAIProviderId(id) ? db.modelConfigs.get(id) : undefined,
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

export function useAvailableModels(): GroupedModel[] {
  const configs = useModelConfigs();

  if (!configs) return [];

  const models: GroupedModel[] = [];

  Object.entries(LOCAL_AI_PROVIDER_NAMES)
    .filter(([id]) => id !== "openai-compatible")
    .forEach(([configId, configName]) => {
      models.push({
        configId,
        configName,
        modelId: DEFAULT_LOCAL_AI_MODEL_ID,
        isRemote: false,
      });
    });

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
  await db.transaction("rw", [db.agents, db.members], async () => {
    const defaultAgent = await db.agents.get(DEFAULT_AGENT.id);
    const agent = defaultAgent ?? DEFAULT_AGENT;
    if (!defaultAgent) {
      await db.agents.add(agent);
    }
    await syncAgentMember(agent);
  });
}

// ==================== Branching Actions ====================

/**
 * Create a new conversation branch from a specific message
 * Copies all messages up to and including the specified message index
 * to a new conversation
 *
 * @param conversationId - Source conversation ID
 * @param upToMessageIndex - Copy messages up to and including this index (0-based)
 * @returns New conversation ID
 */
export async function branchFromMessage(
  conversationId: string,
  upToMessageIndex: number,
  targetConversationId?: string,
  targetActiveRevision?: number,
  publishReservedTarget = false,
  expectedSourceMessages?: ReadonlyArray<
    Pick<Message, "id" | "role" | "content">
  >,
): Promise<string> {
  const newConvId = targetConversationId ?? crypto.randomUUID();
  if (newConvId === conversationId) {
    throw new Error("A conversation cannot branch onto itself.");
  }
  return db.transaction(
    "rw",
    [db.conversations, db.messages, db.pendingConversationDeletions],
    async () => {
      const [sourceConv, sourceDeletion, targetCleanupIntent] =
        await Promise.all([
          db.conversations.get(conversationId),
          db.pendingConversationDeletions.get(conversationId),
          db.pendingConversationDeletions.get(newConvId),
        ]);
      if (!sourceConv) {
        throw new Error("Source conversation not found");
      }
      if (sourceDeletion) {
        throw new Error("Cannot branch a conversation pending deletion.");
      }
      if (
        publishReservedTarget &&
        targetCleanupIntent?.operation !== "branch-cleanup"
      ) {
        throw new Error("Conversation branch cleanup intent is missing.");
      }
      const sourceMessages = await db.messages
        .where("conversationId")
        .equals(conversationId)
        .sortBy("createdAt");
      if (upToMessageIndex < 0 || upToMessageIndex >= sourceMessages.length) {
        throw new Error("Invalid message index for branching");
      }
      const messagesToCopy = sourceMessages.slice(0, upToMessageIndex + 1);
      if (
        expectedSourceMessages &&
        (messagesToCopy.length !== expectedSourceMessages.length ||
          messagesToCopy.some((message, index) => {
            const expected = expectedSourceMessages[index];
            return (
              !expected ||
              message.id !== expected.id ||
              message.role !== expected.role ||
              message.content !== expected.content
            );
          }))
      ) {
        throw new Error(
          "Source conversation changed while the branch was being created.",
        );
      }
      const now = new Date();
      const branchedFrom = {
        conversationId,
        messageIndex: upToMessageIndex,
        createdAt: now.toISOString(),
      };
      await db.conversations.add({
        id: newConvId,
        title: sourceConv.title ? `${sourceConv.title} (branch)` : "New Branch",
        agentId: sourceConv.agentId,
        modelId: sourceConv.modelId,
        activeRevision: targetActiveRevision ?? sourceConv.activeRevision,
        activeProviderId: sourceConv.activeProviderId,
        activeModelId: sourceConv.activeModelId,
        systemPrompt: sourceConv.systemPrompt,
        metadata: {
          ...sourceConv.metadata,
          messageCount: messagesToCopy.length,
          branchedFrom,
        },
        createdAt: now,
        updatedAt: now,
      });
      const baseTime = Date.now();
      const copiedMessageIds = new Map(
        messagesToCopy.map((message) => [message.id, crypto.randomUUID()]),
      );
      await db.messages.bulkAdd(
        messagesToCopy.map((msg, index) => ({
          id: copiedMessageIds.get(msg.id)!,
          conversationId: newConvId,
          role: msg.role,
          content: msg.content,
          senderId: msg.senderId,
          mentions: msg.mentions,
          reactions: msg.reactions,
          ...(msg.replyToMessageId && copiedMessageIds.has(msg.replyToMessageId)
            ? {
                replyToMessageId: copiedMessageIds.get(msg.replyToMessageId),
              }
            : {}),
          turnId: msg.turnId,
          revision: msg.revision,
          providerId: msg.providerId,
          modelId: msg.modelId,
          status: msg.status,
          finishReason: msg.finishReason,
          parts: msg.parts,
          experimental_attachments: msg.experimental_attachments,
          createdAt: new Date(baseTime + index),
        })),
      );
      if (publishReservedTarget) {
        await db.pendingConversationDeletions.delete(newConvId);
      }
      return newConvId;
    },
  );
}

// Auto-initialize. Export the barrier so lifecycle tests and startup consumers
// can avoid closing the database while this first write is still in flight.
export const databaseInitialization = initializeDatabase().catch(console.error);
