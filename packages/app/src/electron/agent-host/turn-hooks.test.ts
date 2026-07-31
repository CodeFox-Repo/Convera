import { describe, expect, it, vi } from "vitest";
import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type { LocalAiTurnHookInput, LocalAiTurnHooks } from "../ai/runtime";
import type { AgentHostRendererBridge } from "./renderer-bridge";
import { withAgentHostTurnHooks } from "./turn-hooks";

function request(providerId: "codex-cli" | "claude-code"): LocalAIChatRequest {
  return {
    requestId: "request",
    conversationId: "conversation",
    turnId: "turn",
    providerId,
    operation: {
      kind: "append",
      message: { role: "user", content: "do the work" },
    },
    agent: { id: "fizz", memberId: "agent:fizz" },
    agentHost: {
      jobId: "job",
      channelId: "channel",
      conversationId: "conversation",
      triggerMessageId: "message",
      agentMemberId: "agent:fizz",
      chain: { hops: 0, invoked: ["agent:fizz"] },
    },
  };
}

function input(providerId: "codex-cli" | "claude-code"): LocalAiTurnHookInput {
  return {
    request: request(providerId),
    prepared: {
      turn: {
        actorId: "agent:fizz",
        revision: 0,
      },
    },
    requestInteraction: vi.fn(),
  } as unknown as LocalAiTurnHookInput;
}

describe("withAgentHostTurnHooks", () => {
  it.each(["codex-cli", "claude-code"] as const)(
    "adds the same native channel catalog for %s without dropping memory context",
    async (providerId) => {
      const memoryTool = { qualifiedName: "memory:search" };
      const base: LocalAiTurnHooks = {
        prepareTurnContext: vi.fn(async () => ({
          systemContext: "durable memory",
          additionalTools: [memoryTool as never],
          contextToken: { kind: "memory-token" },
          forceNewSession: true,
          memoryCursors: { conversation: { epoch: 1, version: 2 } },
        })),
      };
      const hooks = withAgentHostTurnHooks(base, {} as AgentHostRendererBridge);
      const prepared = await hooks.prepareTurnContext?.(input(providerId));

      expect(prepared?.systemContext).toContain("durable memory");
      expect(prepared?.systemContext).toContain(
        "working as a member of a Convera channel",
      );
      expect(
        prepared?.additionalTools?.map((tool) => tool.qualifiedName),
      ).toEqual([
        "memory:search",
        "channel:read_channel",
        "channel:send_message",
        "channel:edit_message",
        "channel:react",
        "channel:list_members",
      ]);
      expect(prepared?.forceNewSession).toBe(true);
      expect(prepared?.memoryCursors).toEqual({
        conversation: { epoch: 1, version: 2 },
      });
    },
  );

  it("passes the original memory token back to completion hooks", async () => {
    const onTurnCompleted = vi.fn();
    const base: LocalAiTurnHooks = {
      prepareTurnContext: async () => ({
        contextToken: { kind: "memory-token", value: 7 },
      }),
      onTurnCompleted,
    };
    const hooks = withAgentHostTurnHooks(base, {} as AgentHostRendererBridge);
    const prepared = await hooks.prepareTurnContext?.(input("codex-cli"));
    await hooks.onTurnCompleted?.({
      request: request("codex-cli"),
      revision: 1,
      assistantText: "done",
      binding: {},
      contextToken: prepared?.contextToken,
    } as never);

    expect(onTurnCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        contextToken: { kind: "memory-token", value: 7 },
      }),
    );
  });
});
