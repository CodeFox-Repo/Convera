import type { Message as RendererMessage } from "@/renderer/types/chat";
import { db, type Conversation, type Message } from "./db/database";
import {
  resolveConversationProviderSelection,
  type ProviderSelection,
} from "./provider-selection";

export interface ConversationSelectionToken {
  conversationId: string | null;
  version: number;
}

export interface ConversationSendContext {
  conversation: Conversation;
  messages: RendererMessage[];
  providerSelection: ProviderSelection;
}

interface PersistedConversationSnapshot {
  conversation: Conversation;
  messages: Message[];
}

interface LoadConversationSendContextOptions {
  selection: ConversationSelectionToken;
  defaultSelection: ProviderSelection;
  getSelection: () => ConversationSelectionToken;
  readSnapshot?: (
    conversationId: string,
  ) => Promise<PersistedConversationSnapshot | null>;
}

export class ConversationSelectionChangedError extends Error {
  readonly code = "CONVERSATION_SELECTION_CHANGED";

  constructor() {
    super("The selected conversation changed before the message was sent.");
    this.name = "ConversationSelectionChangedError";
  }
}

export function assertConversationSelectionUnchanged(
  expected: ConversationSelectionToken,
  current: ConversationSelectionToken,
): void {
  if (
    expected.conversationId !== current.conversationId ||
    expected.version !== current.version
  ) {
    throw new ConversationSelectionChangedError();
  }
}

async function readPersistedConversationSnapshot(
  conversationId: string,
): Promise<PersistedConversationSnapshot | null> {
  return db.transaction("r", [db.conversations, db.messages], async () => {
    const conversation = await db.conversations.get(conversationId);
    if (!conversation) return null;
    const messages = await db.messages
      .where("conversationId")
      .equals(conversationId)
      .sortBy("createdAt");
    return { conversation, messages };
  });
}

function toRendererMessages(messages: Message[]): RendererMessage[] {
  return messages
    .filter(
      (
        message,
      ): message is Message & {
        role: "user" | "assistant" | "system";
      } => message.role !== "tool",
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      parts: message.parts as RendererMessage["parts"],
      experimental_attachments:
        message.experimental_attachments as RendererMessage["experimental_attachments"],
      createdAt: message.createdAt,
    }));
}

/**
 * Reads the provider and transcript from one Dexie snapshot. The selection
 * version prevents both an ordinary conversation switch and an A -> B -> A
 * switch from reusing stale renderer state while the read is in flight.
 */
export async function loadConversationSendContext({
  selection,
  defaultSelection,
  getSelection,
  readSnapshot = readPersistedConversationSnapshot,
}: LoadConversationSendContextOptions): Promise<ConversationSendContext | null> {
  assertConversationSelectionUnchanged(selection, getSelection());
  if (!selection.conversationId) return null;

  const snapshot = await readSnapshot(selection.conversationId);
  assertConversationSelectionUnchanged(selection, getSelection());
  if (!snapshot) return null;

  return {
    conversation: snapshot.conversation,
    messages: toRendererMessages(snapshot.messages),
    providerSelection: resolveConversationProviderSelection(
      snapshot.conversation,
      defaultSelection,
    ),
  };
}

export function buildAuthoritativeEditMessages(
  messages: RendererMessage[],
  sourceMessageId: string,
  content: string,
): RendererMessage[] | null {
  const messageIndex = messages.findIndex(
    (message) => message.id === sourceMessageId,
  );
  if (messageIndex === -1) return null;
  return messages
    .slice(0, messageIndex + 1)
    .map((message, index) =>
      index === messageIndex ? { ...message, content } : message,
    );
}

export function buildAuthoritativeRegenerateMessages(
  messages: RendererMessage[],
  sourceMessageId: string,
): RendererMessage[] | null {
  const lastMessage = messages.at(-1);
  if (lastMessage?.role !== "assistant" || lastMessage.id !== sourceMessageId) {
    return null;
  }
  return messages.slice(0, -1);
}
