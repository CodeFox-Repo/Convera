import { describe, expect, it } from "vitest";
import {
  hiddenConversationIds,
  searchConversationsAndMessages,
  stripMarkdown,
} from "../conversation-search-utils";
import type { Conversation, Message } from "../../db/database";

describe("stripMarkdown", () => {
  it("removes bold and italic markers", () => {
    expect(stripMarkdown("**Paddle** is a _merchant_ of record")).toBe(
      "Paddle is a merchant of record",
    );
  });

  it("removes inline code, links and headings", () => {
    expect(stripMarkdown("# Title\nsee [docs](https://x.dev) and `code`")).toBe(
      "Title see docs and code",
    );
  });

  it("removes list bullets and collapses whitespace", () => {
    expect(stripMarkdown("- **Paddle**: 5% + $0.50\n- **Stripe**: 2.9%")).toBe(
      "Paddle: 5% + $0.50 Stripe: 2.9%",
    );
  });

  it("drops fenced code blocks", () => {
    expect(stripMarkdown("before\n```js\nconst x = 1;\n```\nafter")).toBe(
      "before after",
    );
  });
});

describe("hiddenConversationIds", () => {
  const channel = (id: string, conversationId: string) => ({
    id,
    conversationId,
  });

  it("hides the conversation behind a channel the viewer cannot see", () => {
    const all = [
      channel("open", "conv-open"),
      channel("secret", "conv-secret"),
    ];
    const visible = [channel("open", "conv-open")];

    const hidden = hiddenConversationIds(all, visible);

    expect(hidden.has("conv-secret")).toBe(true);
    expect(hidden.has("conv-open")).toBe(false);
  });

  it("leaves plain chats — conversations backed by no channel — searchable", () => {
    const hidden = hiddenConversationIds([], []);
    expect(hidden.has("conv-plain-chat")).toBe(false);
  });
});

describe("searchConversationsAndMessages", () => {
  const conversation = (id: string, title: string | null): Conversation => ({
    id,
    title,
    agentId: null,
    modelId: null,
    activeRevision: 1,
    activeProviderId: null,
    activeModelId: null,
    systemPrompt: null,
    metadata: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });

  const message = (
    id: string,
    conversationId: string,
    content: string,
    senderId?: string,
  ): Message => ({
    id,
    conversationId,
    role: senderId ? "assistant" : "user",
    content,
    ...(senderId ? { senderId } : {}),
    createdAt: new Date(0),
  });

  it("finds a message by its content and reports where and from whom", async () => {
    const results = await searchConversationsAndMessages(
      "paddle",
      [conversation("c1", "Billing")],
      [message("m1", "c1", "We should use **Paddle** for VAT", "member-agent")],
    );

    const hit = results.find((result) => result.type === "message");
    expect(hit).toBeDefined();
    expect(hit?.messageId).toBe("m1");
    expect(hit?.conversationId).toBe("c1");
    // Identity travels as an id; the name is resolved at render time.
    expect(hit?.senderId).toBe("member-agent");
    // Snippet reads as prose, not markdown.
    expect(hit?.matchedText).toContain("Paddle");
    expect(hit?.matchedText).not.toContain("**");
  });

  it("returns nothing for a query that matches no message", async () => {
    const results = await searchConversationsAndMessages(
      "kubernetes",
      [conversation("c1", "Billing")],
      [message("m1", "c1", "We should use Paddle for VAT")],
    );

    expect(results.filter((result) => result.type === "message")).toEqual([]);
  });

  it("ignores an empty query rather than matching everything", async () => {
    expect(
      await searchConversationsAndMessages(
        "   ",
        [conversation("c1", "Billing")],
        [message("m1", "c1", "anything")],
      ),
    ).toEqual([]);
  });
});
