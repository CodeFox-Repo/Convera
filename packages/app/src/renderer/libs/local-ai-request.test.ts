import { describe, expect, it } from "vitest";
import type { Message } from "@/renderer/types/chat";
import type { LocalAIConversationRuntimeState } from "@/shared/types/local-ai";
import {
  BOOTSTRAP_CHARACTER_LIMIT,
  BOOTSTRAP_MESSAGE_LIMIT,
  BOOTSTRAP_TRUNCATION_MARKER,
  buildLocalAIChatOperation,
  selectAppendOperation,
  toLocalAIRequestMessages,
} from "./local-ai-request";

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
): Message {
  return { id, role, content };
}

describe("local AI request composition", () => {
  const transcript = [
    message("user-1", "user", "first"),
    message("assistant-1", "assistant", "answer"),
    message("user-2", "user", "next"),
  ];

  it("sends only the newest user message for a normal append", () => {
    expect(buildLocalAIChatOperation(transcript, { kind: "append" })).toEqual({
      kind: "append",
      message: { id: "user-2", role: "user", content: "next" },
    });
  });

  it("uses the visible transcript only for bootstrap and rebase", () => {
    expect(
      buildLocalAIChatOperation(transcript, { kind: "bootstrap" }),
    ).toEqual({
      kind: "bootstrap",
      messages: toLocalAIRequestMessages(transcript),
    });
    expect(
      buildLocalAIChatOperation(transcript.slice(0, 1), {
        kind: "rebase",
        reason: "edit",
        sourceMessageId: "user-1",
      }),
    ).toEqual({
      kind: "rebase",
      reason: "edit",
      sourceMessageId: "user-1",
      messages: [{ id: "user-1", role: "user", content: "first" }],
    });
  });

  it("rejects append when the latest runtime message is not a user turn", () => {
    expect(() =>
      buildLocalAIChatOperation(transcript.slice(0, 2), { kind: "append" }),
    ).toThrow("latest user message");
  });

  const runtimeState: LocalAIConversationRuntimeState = {
    conversationId: "conversation-1",
    revision: 2,
    memoryEpoch: 0,
    memoryVersion: 0,
    providers: [
      {
        providerId: "codex-cli",
        revision: 2,
        stale: false,
        updatedAt: "2026-07-31T00:00:00.000Z",
      },
    ],
  };

  it("bootstraps a legacy transcript without main runtime state", () => {
    expect(selectAppendOperation(null, "codex-cli", 3)).toEqual({
      kind: "bootstrap",
    });
    expect(selectAppendOperation(null, "codex-cli", 0)).toEqual({
      kind: "append",
    });
  });

  it("appends only when the selected provider has a current binding", () => {
    expect(selectAppendOperation(runtimeState, "codex-cli", 3)).toEqual({
      kind: "append",
    });
    expect(selectAppendOperation(runtimeState, "claude-code", 3)).toEqual({
      kind: "bootstrap",
    });
  });

  it("bootstraps branch and reset states whose bindings are absent or stale", () => {
    expect(
      selectAppendOperation({ ...runtimeState, providers: [] }, "codex-cli", 3),
    ).toEqual({ kind: "bootstrap" });
    expect(
      selectAppendOperation(
        {
          ...runtimeState,
          providers: [{ ...runtimeState.providers[0], stale: true }],
        },
        "codex-cli",
        3,
      ),
    ).toEqual({ kind: "bootstrap" });
    expect(
      selectAppendOperation(
        {
          ...runtimeState,
          providers: [{ ...runtimeState.providers[0], revision: 1 }],
        },
        "codex-cli",
        3,
      ),
    ).toEqual({ kind: "bootstrap" });
  });

  it("bounds bootstrap history newest-first and marks truncation", () => {
    const longTranscript: Message[] = [
      { id: "system", role: "system", content: "system policy" },
      ...Array.from({ length: 150 }, (_, index) =>
        message(
          `message-${index}`,
          index % 2 === 0 ? "user" : "assistant",
          `content-${index}`,
        ),
      ),
    ];
    const operation = buildLocalAIChatOperation(longTranscript, {
      kind: "bootstrap",
    });
    expect(operation.kind).toBe("bootstrap");
    if (operation.kind !== "bootstrap") return;
    expect(operation.messages.length).toBeLessThanOrEqual(
      BOOTSTRAP_MESSAGE_LIMIT,
    );
    expect(operation.messages[0].content).toBe(BOOTSTRAP_TRUNCATION_MARKER);
    expect(operation.messages).toContainEqual({
      id: "system",
      role: "system",
      content: "system policy",
    });
    expect(operation.messages.at(-1)?.id).toBe("message-149");
  });

  it("bounds bootstrap and rebase character budgets", () => {
    const characterHeavyTranscript = Array.from({ length: 4 }, (_, index) =>
      message(
        `large-${index}`,
        index % 2 === 0 ? "user" : "assistant",
        String(index).repeat(80_000),
      ),
    );
    for (const operation of [
      buildLocalAIChatOperation(characterHeavyTranscript, {
        kind: "bootstrap",
      }),
      buildLocalAIChatOperation(characterHeavyTranscript, {
        kind: "rebase",
        reason: "regenerate",
      }),
    ]) {
      if (operation.kind === "append") throw new Error("unexpected append");
      expect(
        operation.messages.reduce(
          (total, runtimeMessage) => total + runtimeMessage.content.length,
          0,
        ),
      ).toBeLessThanOrEqual(BOOTSTRAP_CHARACTER_LIMIT);
      expect(operation.messages.at(-1)?.id).toBe("large-3");
    }
  });
});
