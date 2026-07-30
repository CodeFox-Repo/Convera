import type {
  LocalAIChatRequest,
  LocalAIStreamEvent,
  LocalAISubconsciousProvider,
} from "@/shared/types/local-ai";
import { describe, expect, it, vi } from "vitest";
import type { CuratorInput } from "../memory/subconscious-worker";
import type { MemoryPatch } from "../memory/types";
import {
  RESTRICTED_MEMORY_CURATOR_SYSTEM_PROMPT,
  RestrictedMemoryCurator,
  resolveSubscriptionMemoryProvider,
  type SubscriptionMemoryRuntime,
} from "./subscription-memory-curator";

const timestamp = "2026-07-31T00:00:00.000Z";

function input(providerIds: string[] = ["codex-cli"]): CuratorInput {
  const scope = { kind: "conversation" as const, id: "conversation-1" };
  return {
    jobId: "job-1",
    expectedPatchTurnId: "subconscious:job-1",
    scope,
    baseVersion: 4,
    snapshot: {
      scope,
      version: 4,
      epoch: 1,
      blocks: [],
      deltas: [],
      retrievedAt: timestamp,
      stale: false,
      pendingTurnIds: [],
    },
    turns: providerIds.map((providerId, index) => ({
      turnId: `source-turn-${index + 1}`,
      scope,
      userContent: `user ${index + 1}`,
      assistantContent: `assistant ${index + 1}`,
      completedAt: timestamp,
      providerId,
      candidates: [],
    })),
    allowedCapabilities: ["memory_read", "memory_search", "memory_apply_patch"],
  };
}

function patchFor(value: CuratorInput, providerId = "codex-cli"): MemoryPatch {
  return {
    scope: value.scope,
    baseVersion: value.baseVersion,
    turnId: value.expectedPatchTurnId,
    provenance: {
      actor: "subconscious",
      turnId: value.expectedPatchTurnId,
      timestamp,
      providerId,
    },
    operations: [
      {
        type: "upsert_block",
        label: "preferences",
        value: "Use concise answers.",
      },
    ],
  };
}

class FakeRuntime implements SubscriptionMemoryRuntime {
  readonly requests: LocalAIChatRequest[] = [];

  constructor(
    private readonly run: (
      request: LocalAIChatRequest,
      emit: (event: LocalAIStreamEvent) => void,
    ) => void | Promise<void>,
  ) {}

  async startChat(
    request: LocalAIChatRequest,
    emit: (event: LocalAIStreamEvent) => void,
  ): Promise<void> {
    this.requests.push(request);
    await this.run(request, emit);
  }

  respondToInteraction(): boolean {
    return true;
  }
}

function successfulRuntime(
  output: string,
  reason: "stop" | "length" = "stop",
): FakeRuntime {
  return new FakeRuntime((request, emit) => {
    emit({
      type: "ui-message",
      requestId: request.requestId,
      chunk: { type: "text-delta", id: "text-1", delta: output },
    });
    emit({
      type: "finish",
      requestId: request.requestId,
      finishReason: reason,
    });
  });
}

describe("RestrictedMemoryCurator", () => {
  it.each([
    ["codex-cli", "codex-cli"],
    ["claude-code", "claude-code"],
  ] satisfies Array<
    [LocalAISubconsciousProvider, LocalAISubconsciousProvider]
  >)("resolves the explicit %s provider", async (setting, expected) => {
    await expect(
      resolveSubscriptionMemoryProvider(setting, input()),
    ).resolves.toBe(expected);
  });

  it("follows the provider used by the latest completed turn", async () => {
    await expect(
      resolveSubscriptionMemoryProvider(
        "follow-active",
        input(["codex-cli", "claude-code"]),
      ),
    ).resolves.toBe("claude-code");
  });

  it("rejects off without invoking the subscription runtime", async () => {
    const runtime = successfulRuntime("{}");
    const curator = new RestrictedMemoryCurator({
      provider: "off",
      runtime,
    });

    await expect(curator.curate(input())).rejects.toMatchObject({
      code: "LOCAL_AI_MEMORY_CURATOR_DISABLED",
    });
    expect(runtime.requests).toEqual([]);
  });

  it("uses an isolated durable conversation and a strict append prompt", async () => {
    const curatorInput = input();
    const runtime = successfulRuntime(JSON.stringify(patchFor(curatorInput)));
    const curator = new RestrictedMemoryCurator({
      provider: "codex-cli",
      runtime,
      idFactory: () => "attempt-1",
      now: () => new Date(timestamp),
    });

    await expect(curator.curate(curatorInput)).resolves.toEqual(
      patchFor(curatorInput),
    );

    expect(runtime.requests).toHaveLength(1);
    const request = runtime.requests[0]!;
    expect(request).toMatchObject({
      requestId: "memory-curator-request:attempt-1",
      turnId: "memory-curator-turn:attempt-1",
      conversationId: "memory-curator:conversation:conversation-1:codex-cli",
      providerId: "codex-cli",
      operation: { kind: "append" },
      agent: { id: "restricted-memory-curator" },
      options: { temperature: 0 },
    });
    expect(request.agent?.systemPrompt).toBe(
      RESTRICTED_MEMORY_CURATOR_SYSTEM_PROMPT,
    );
    expect(request.agent?.systemPrompt).toContain("Never use or request shell");
    if (request.operation.kind !== "append") {
      throw new Error("Expected append operation");
    }
    expect(request.operation.message.content).toContain(
      '"turnId": "subconscious:job-1"',
    );
    expect(request.operation.message.content).toContain('"snapshot"');
    expect(request.operation.message.content).toContain('"turns"');
    expect(request.operation.message.content).toContain('"candidates"');
  });

  it("accepts a single fenced json object", async () => {
    const curatorInput = input(["claude-code"]);
    const runtime = successfulRuntime(
      `\`\`\`json\n${JSON.stringify(
        patchFor(curatorInput, "claude-code"),
      )}\n\`\`\``,
    );
    const curator = new RestrictedMemoryCurator({
      provider: "follow-active",
      runtime,
    });

    await expect(curator.curate(curatorInput)).resolves.toEqual(
      patchFor(curatorInput, "claude-code"),
    );
    expect(runtime.requests[0]?.providerId).toBe("claude-code");
  });

  it("allows an explicit noop instead of fabricating a memory write", async () => {
    const runtime = successfulRuntime(
      JSON.stringify({
        action: "noop",
        reason: "No new durable information.",
      }),
    );
    const curator = new RestrictedMemoryCurator({
      provider: "codex-cli",
      runtime,
    });

    await expect(curator.curate(input())).resolves.toEqual({
      action: "noop",
      reason: "No new durable information.",
    });
    expect(runtime.requests[0]?.agent?.systemPrompt).toContain(
      '{"action":"noop"',
    );
  });

  it("rebases the isolated conversation once when its binding is stale", async () => {
    const curatorInput = input();
    let call = 0;
    const runtime = new FakeRuntime((request, emit) => {
      call += 1;
      if (call === 1) {
        emit({
          type: "error",
          requestId: request.requestId,
          error: {
            name: "Error",
            message: "Synthetic provider session is stale.",
            code: "LOCAL_AI_SESSION_REBASE_REQUIRED",
          },
        });
        emit({
          type: "finish",
          requestId: request.requestId,
          finishReason: "error",
        });
        return;
      }
      emit({
        type: "ui-message",
        requestId: request.requestId,
        chunk: {
          type: "text-delta",
          id: "text-1",
          delta: JSON.stringify(patchFor(curatorInput)),
        },
      });
      emit({
        type: "finish",
        requestId: request.requestId,
        finishReason: "stop",
      });
    });
    const ids = ["append-attempt", "rebase-attempt"];
    const curator = new RestrictedMemoryCurator({
      provider: "codex-cli",
      runtime,
      idFactory: () => ids.shift()!,
      now: () => new Date(timestamp),
    });

    await expect(curator.curate(curatorInput)).resolves.toEqual(
      patchFor(curatorInput),
    );
    expect(runtime.requests).toHaveLength(2);
    expect(runtime.requests[0]).toMatchObject({
      requestId: "memory-curator-request:append-attempt",
      turnId: "memory-curator-turn:append-attempt",
      operation: { kind: "append" },
    });
    expect(runtime.requests[1]).toMatchObject({
      requestId: "memory-curator-request:rebase-attempt",
      turnId: "memory-curator-turn:rebase-attempt",
      conversationId: "memory-curator:conversation:conversation-1:codex-cli",
      operation: {
        kind: "rebase",
        reason: "regenerate",
        messages: [
          {
            role: "user",
            content: expect.stringContaining('"turnId": "subconscious:job-1"'),
          },
        ],
      },
    });
    expect(runtime.requests[1]?.conversationId).toBe(
      runtime.requests[0]?.conversationId,
    );
  });

  it("does not rebase more than once", async () => {
    const runtime = new FakeRuntime((request, emit) => {
      emit({
        type: "error",
        requestId: request.requestId,
        error: {
          name: "Error",
          message: "Synthetic provider session is stale.",
          code: "LOCAL_AI_SESSION_REBASE_REQUIRED",
        },
      });
      emit({
        type: "finish",
        requestId: request.requestId,
        finishReason: "error",
      });
    });
    const curator = new RestrictedMemoryCurator({
      provider: "codex-cli",
      runtime,
    });

    await expect(curator.curate(input())).rejects.toMatchObject({
      code: "LOCAL_AI_SESSION_REBASE_REQUIRED",
    });
    expect(runtime.requests).toHaveLength(2);
    expect(runtime.requests.map((request) => request.operation.kind)).toEqual([
      "append",
      "rebase",
    ]);
  });

  it("rejects provider errors and non-stop terminal events", async () => {
    const providerRuntime = new FakeRuntime((request, emit) => {
      emit({
        type: "error",
        requestId: request.requestId,
        error: {
          name: "Error",
          message: "subscription unavailable",
          code: "PROVIDER_UNAUTHENTICATED",
        },
      });
      emit({
        type: "finish",
        requestId: request.requestId,
        finishReason: "error",
      });
    });
    const providerCurator = new RestrictedMemoryCurator({
      provider: "codex-cli",
      runtime: providerRuntime,
    });
    await expect(providerCurator.curate(input())).rejects.toMatchObject({
      code: "PROVIDER_UNAUTHENTICATED",
      message: expect.stringContaining("subscription unavailable"),
    });
    expect(providerRuntime.requests).toHaveLength(1);

    const incompleteCurator = new RestrictedMemoryCurator({
      provider: "codex-cli",
      runtime: successfulRuntime(JSON.stringify(patchFor(input())), "length"),
    });
    await expect(incompleteCurator.curate(input())).rejects.toMatchObject({
      code: "LOCAL_AI_MEMORY_CURATOR_INCOMPLETE",
    });
  });

  it("uses the active-provider resolver when turns do not identify one", async () => {
    const getActiveProviderId = vi.fn(async () => "claude-code" as const);
    await expect(
      resolveSubscriptionMemoryProvider(
        "follow-active",
        input([]),
        getActiveProviderId,
      ),
    ).resolves.toBe("claude-code");
    expect(getActiveProviderId).toHaveBeenCalledWith({
      kind: "conversation",
      id: "conversation-1",
    });
  });
});
