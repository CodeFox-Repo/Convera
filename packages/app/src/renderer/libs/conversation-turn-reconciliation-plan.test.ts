import { describe, expect, it } from "vitest";
import type { LocalAITurnRuntimeState } from "@/shared/types/local-ai";
import type { PendingTurnJournal } from "./db/database";
import {
  LIVE_FINALIZER_GRACE_MS,
  TURN_NOT_FOUND_GRACE_MS,
  planTurnReconciliation,
} from "./conversation-turn-reconciliation-plan";

function journal(
  overrides: Partial<PendingTurnJournal> = {},
): PendingTurnJournal {
  return {
    turnId: "turn-1",
    requestId: "request-1",
    conversationId: "conversation-1",
    operation: "append",
    providerId: "codex-cli",
    expectedRevision: 0,
    userMessageId: "user-1",
    assistantMessageId: "assistant-1",
    desiredMessageIds: ["user-1", "assistant-1"],
    insertedMessageIds: ["user-1", "assistant-1"],
    previousMessages: [],
    state: "transport-uncertain",
    createdAt: new Date(1_000),
    updatedAt: new Date(1_000),
    ...overrides,
  };
}

function runtime(
  status: LocalAITurnRuntimeState["status"],
  overrides: Partial<LocalAITurnRuntimeState> = {},
): LocalAITurnRuntimeState {
  return {
    conversationId: "conversation-1",
    turnId: "turn-1",
    requestId: "request-1",
    providerId: "codex-cli",
    revision: 0,
    status,
    startedAt: new Date(1_000).toISOString(),
    ...overrides,
  };
}

describe("turn reconciliation plan", () => {
  it("defers a young ambiguous not-found but restores a stable one", () => {
    expect(
      planTurnReconciliation(journal(), null, {
        now: 1_000 + TURN_NOT_FOUND_GRACE_MS - 1,
        stableNotFound: false,
      }),
    ).toBe("defer");
    expect(
      planTurnReconciliation(journal(), null, {
        now: 1_001,
        stableNotFound: true,
      }),
    ).toBe("rollback");
  });

  it("recovers completed output and cleans an already acknowledged turn", () => {
    expect(
      planTurnReconciliation(journal(), runtime("completed"), {
        now: 10_000,
        stableNotFound: false,
      }),
    ).toBe("complete");
    expect(
      planTurnReconciliation(
        journal(),
        runtime("completed", {
          rendererPersistedAt: new Date(2_000).toISOString(),
        }),
        { now: 10_000, stableNotFound: false },
      ),
    ).toBe("cleanup");
  });

  it("gives the live owner time to persist structured assistant parts", () => {
    expect(
      planTurnReconciliation(
        journal({ state: "accepted" }),
        runtime("completed", {
          completedAt: new Date(10_000).toISOString(),
          assistantText: "fallback text",
        }),
        {
          now: 10_000 + LIVE_FINALIZER_GRACE_MS - 1,
          stableNotFound: false,
          preferLiveGrace: true,
          liveAvailable: false,
        },
      ),
    ).toBe("defer");
    expect(
      planTurnReconciliation(
        journal({ state: "accepted" }),
        runtime("completed", {
          completedAt: new Date(10_000).toISOString(),
        }),
        {
          now: 10_001,
          stableNotFound: false,
          preferLiveGrace: true,
          liveAvailable: true,
        },
      ),
    ).toBe("complete");
  });

  it("restores failed edit/rebase rows but keeps append failures visible", () => {
    expect(
      planTurnReconciliation(
        journal({ operation: "rebase", operationReason: "edit" }),
        runtime("uncertain"),
        { now: 10_000, stableNotFound: false },
      ),
    ).toBe("restore");
    expect(
      planTurnReconciliation(journal(), runtime("aborted"), {
        now: 10_000,
        stableNotFound: false,
      }),
    ).toBe("fail");
  });
});
