import { describe, expect, it } from "vitest";
import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import {
  delegateTaskInputSchema,
  delegateTaskJsonSchema,
  handoffTaskInputSchema,
  handoffTaskJsonSchema,
  trustedStructuredTaskContext,
} from "../structured-task-contracts";

function request(): LocalAIChatRequest {
  return {
    requestId: "request-1",
    conversationId: "conversation-1",
    turnId: "turn-1",
    providerId: "codex-cli",
    operation: {
      kind: "append",
      message: { role: "user", content: "Delegate the research." },
    },
    agent: { id: "fizz", memberId: "agent:fizz" },
    agentHost: {
      jobId: "job-1",
      taskId: "task-1",
      channelKind: "channel",
      collaborationTargets: [
        { agentId: "fizz", memberId: "agent:fizz" },
        { agentId: "reviewer", memberId: "agent:reviewer" },
      ],
      roomContext: "Private per-turn context that must not enter the contract.",
    },
  };
}

const outputContract = {
  format: "json" as const,
  description: "Return findings with citations.",
  result_schema: {
    type: "object",
    required: ["findings"],
  },
};

describe("structured task tool contracts", () => {
  it("accepts a bounded parallel delegation and applies join defaults", () => {
    const parsed = delegateTaskInputSchema.parse({
      idempotency_key: "task-1:research:v1",
      delegates: [
        {
          assignee_member_id: "agent:researcher",
          objective: "Find the primary sources.",
          acceptance_criteria: ["At least two official sources"],
          context_refs: [{ kind: "message", message_id: "message-1" }],
          output_contract: outputContract,
        },
        {
          assignee_member_id: "agent:reviewer",
          objective: "Review the claims.",
          acceptance_criteria: ["Identify unsupported claims"],
          output_contract: outputContract,
        },
      ],
      join: { strategy: "quorum", quorum: 2 },
      ttl_seconds: 900,
    });

    expect(parsed.join.cancel_remaining_on_satisfied).toBe(true);
    expect(parsed.delegates).toHaveLength(2);
  });

  it("rejects invalid joins, duplicate assignees, and caller-controlled identity", () => {
    const base = {
      idempotency_key: "delegation-1",
      delegates: [
        {
          assignee_member_id: "agent:researcher",
          objective: "Research it.",
          acceptance_criteria: ["Return evidence"],
          output_contract: outputContract,
        },
      ],
    };

    expect(() =>
      delegateTaskInputSchema.parse({
        ...base,
        delegates: [...base.delegates, ...base.delegates],
        join: { strategy: "all" },
      }),
    ).toThrow("Each assignee may appear only once");
    expect(() =>
      delegateTaskInputSchema.parse({
        ...base,
        join: { strategy: "quorum", quorum: 2 },
      }),
    ).toThrow("Quorum cannot exceed");
    expect(() =>
      delegateTaskInputSchema.parse({
        ...base,
        join: { strategy: "all" },
        task_id: "some-other-task",
      }),
    ).toThrow();
  });

  it("keeps handoff intent distinct from task identity and defaults to acceptance", () => {
    const parsed = handoffTaskInputSchema.parse({
      idempotency_key: "task-1:handoff:v1",
      to_member_id: "agent:reviewer",
      reason: "The task now needs a security owner.",
      context_refs: [{ kind: "artifact", artifact_id: "artifact-1" }],
    });

    expect(parsed.acceptance).toBe("auto_if_authorized");
    expect(parsed).not.toHaveProperty("task_id");
    expect(() =>
      handoffTaskInputSchema.parse({
        ...parsed,
        to_member_id: "human:owner",
      }),
    ).toThrow("Expected an agent member id");
  });

  it("publishes provider schemas without trusted identity fields", () => {
    for (const schema of [delegateTaskJsonSchema, handoffTaskJsonSchema]) {
      const serialized = JSON.stringify(schema);
      expect(serialized).not.toContain("task_id");
      expect(serialized).not.toContain("job_id");
      expect(serialized).not.toContain("callerMemberId");
      expect(schema).toMatchObject({ type: "object" });
    }
  });
});

describe("trusted structured task context", () => {
  it("derives immutable ownership context from the Host-bound request", () => {
    const context = trustedStructuredTaskContext(request());

    expect(context).toEqual({
      contractVersion: 1,
      taskId: "task-1",
      jobId: "job-1",
      conversationId: "conversation-1",
      channelKind: "channel",
      callerAgentId: "fizz",
      callerMemberId: "agent:fizz",
      targets: [
        { agentId: "fizz", memberId: "agent:fizz" },
        { agentId: "reviewer", memberId: "agent:reviewer" },
      ],
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context?.targets)).toBe(true);
    expect(JSON.stringify(context)).not.toContain("roomContext");
  });

  it("is unavailable outside a complete Agent Host execution identity", () => {
    const plain = request();
    plain.agentHost = undefined;
    expect(trustedStructuredTaskContext(plain)).toBeUndefined();

    const anonymous = request();
    anonymous.agent = undefined;
    expect(trustedStructuredTaskContext(anonymous)).toBeUndefined();

    const human = request();
    human.agent = { id: "human", memberId: "human:owner" };
    expect(trustedStructuredTaskContext(human)).toBeUndefined();
  });
});
