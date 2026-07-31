import { describe, expect, it } from "vitest";
import {
  assertPendingTurnCanStage,
  selectPendingTurnMessages,
} from "./pending-turn-stage";

describe("pending turn staging", () => {
  const base = [
    { id: "user-1", role: "user", content: "hello" },
    { id: "assistant-1", role: "assistant", content: "hi" },
  ];

  it("rejects a stale transcript instead of overwriting another renderer", () => {
    expect(() =>
      assertPendingTurnCanStage(
        [...base, { id: "user-2", role: "user", content: "other window" }],
        base,
      ),
    ).toThrow("Conversation changed");
  });

  it("allows only one pending turn across renderer windows", () => {
    expect(() =>
      assertPendingTurnCanStage(
        [
          ...base,
          {
            id: "assistant-2",
            role: "assistant",
            content: "",
            turnId: "other-turn",
            status: "pending",
          },
        ],
        base,
      ),
    ).toThrow("already has an outgoing turn");
  });

  it("ignores preserved tool rows when comparing the visible transcript", () => {
    expect(() =>
      assertPendingTurnCanStage(
        [base[0], { id: "tool-1", role: "tool", content: "result" }, base[1]],
        base,
      ),
    ).not.toThrow();
  });

  it("stages only this turn's outgoing user and assistant shell", () => {
    const pending = selectPendingTurnMessages(
      [
        ...base,
        { id: "user-2", role: "user", content: "next" },
        { id: "assistant-2", role: "assistant", content: "" },
      ],
      {
        turnId: "turn-2",
        userMessageId: "user-2",
        assistantMessageId: "assistant-2",
      },
    );

    expect(pending.map((message) => message.id)).toEqual([
      "user-2",
      "assistant-2",
    ]);
  });

  it("stages a turn that is not going to speak", () => {
    // An agent offered the floor may decide it has nothing to add. Silence
    // must leave no row at all — not an empty bubble deleted after the fact.
    const pending = selectPendingTurnMessages(
      [...base, { id: "user-2", role: "user", content: "next" }],
      { turnId: "turn-2", userMessageId: "user-2" },
    );

    expect(pending.map((message) => message.id)).toEqual(["user-2"]);
  });

  it("still refuses a turn whose promised shell went missing", () => {
    // The distinction that matters: declaring no reply is legal, losing the
    // row of a reply that was coming is transcript corruption.
    expect(() =>
      selectPendingTurnMessages(
        [...base, { id: "user-2", role: "user", content: "next" }],
        {
          turnId: "turn-2",
          userMessageId: "user-2",
          assistantMessageId: "assistant-2",
        },
      ),
    ).toThrow(/assistant shell is missing/);
  });
});
