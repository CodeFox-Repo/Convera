import { describe, expect, it, vi } from "vitest";
import type { Conversation, Message } from "./db/database";
import {
  buildAuthoritativeEditMessages,
  buildAuthoritativeRegenerateMessages,
  ConversationSelectionChangedError,
  loadConversationSendContext,
  type ConversationSelectionToken,
} from "./conversation-send-context";

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  const now = new Date("2026-07-31T00:00:00.000Z");
  return {
    id: "conversation-b",
    title: "Target",
    agentId: null,
    modelId: "claude-code:claude-sonnet",
    activeRevision: 4,
    activeProviderId: "claude-code",
    activeModelId: "claude-sonnet",
    systemPrompt: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function message(
  id: string,
  content: string,
  role: Message["role"] = "user",
): Message {
  return {
    id,
    conversationId: "conversation-b",
    role,
    content,
    createdAt: new Date("2026-07-31T00:00:00.000Z"),
  };
}

describe("authoritative conversation send context", () => {
  const defaultSelection = {
    configId: "codex-cli",
    modelId: "default",
  };
  const selection: ConversationSelectionToken = {
    conversationId: "conversation-b",
    version: 7,
  };

  it("uses the target Dexie provider and transcript instead of renderer state", async () => {
    const target = {
      ...message("target-user", "target history"),
      senderId: "me",
      mentions: ["agent:fizz"],
      reactions: { "👍": ["me"] },
      replyToMessageId: "earlier-message",
    };
    const readSnapshot = vi.fn(async () => ({
      conversation: conversation(),
      messages: [target, message("target-tool", "hidden tool result", "tool")],
    }));

    await expect(
      loadConversationSendContext({
        selection,
        defaultSelection,
        getSelection: () => selection,
        readSnapshot,
      }),
    ).resolves.toMatchObject({
      conversation: { id: "conversation-b", activeRevision: 4 },
      providerSelection: {
        configId: "claude-code",
        modelId: "claude-sonnet",
      },
      messages: [
        {
          id: "target-user",
          content: "target history",
          senderId: "me",
          mentions: ["agent:fizz"],
          reactions: { "👍": ["me"] },
          replyToMessageId: "earlier-message",
        },
      ],
    });
    expect(readSnapshot).toHaveBeenCalledWith("conversation-b");
  });

  it("rejects a conversation switch while the Dexie snapshot is loading", async () => {
    let current = selection;
    const readSnapshot = async () => {
      current = { conversationId: "conversation-c", version: 8 };
      return { conversation: conversation(), messages: [] };
    };

    await expect(
      loadConversationSendContext({
        selection,
        defaultSelection,
        getSelection: () => current,
        readSnapshot,
      }),
    ).rejects.toBeInstanceOf(ConversationSelectionChangedError);
  });

  it("rejects an A to B to A selection change with the same final id", async () => {
    let current = selection;
    const readSnapshot = async () => {
      current = { conversationId: "conversation-b", version: 9 };
      return { conversation: conversation(), messages: [] };
    };

    await expect(
      loadConversationSendContext({
        selection,
        defaultSelection,
        getSelection: () => current,
        readSnapshot,
      }),
    ).rejects.toBeInstanceOf(ConversationSelectionChangedError);
  });

  it("rebases edit and regenerate only when the clicked message exists in the authoritative transcript", () => {
    const messages = [
      {
        id: "target-user",
        role: "user" as const,
        content: "target history",
      },
      {
        id: "target-assistant",
        role: "assistant" as const,
        content: "target answer",
      },
    ];

    expect(
      buildAuthoritativeEditMessages(messages, "target-user", "edited"),
    ).toEqual([{ id: "target-user", role: "user", content: "edited" }]);
    expect(
      buildAuthoritativeRegenerateMessages(messages, "target-assistant"),
    ).toEqual([messages[0]]);
    expect(
      buildAuthoritativeEditMessages(messages, "stale-user", "wrong"),
    ).toBeNull();
    expect(
      buildAuthoritativeRegenerateMessages(messages, "stale-assistant"),
    ).toBeNull();
  });
});
