import { describe, expect, it } from "vitest";
import type {
  AgentHostJob,
  AgentHostWorkflowState,
} from "@/shared/types/agent-host";
import {
  beginWorkflowNode,
  commitProviderEffect,
  commitWorkflowNode,
  createAgentHostWorkflow,
  currentWorkflowNode,
  prepareProviderEffect,
  providerEffectInputHash,
  recordWorkflowNodeResult,
  recoverAgentHostWorkflow,
  startProviderEffect,
} from "./workflow";

const T0 = "2026-08-02T12:00:00.000Z";
const T1 = "2026-08-02T12:00:01.000Z";
const T2 = "2026-08-02T12:00:02.000Z";
const T3 = "2026-08-02T12:00:03.000Z";

function job(): AgentHostJob {
  return {
    id: "job-1",
    taskId: "task-1",
    channelId: "channel-1",
    channelKind: "channel",
    conversationId: "conversation-1",
    triggerMessageId: "message-1",
    contextMessageIds: ["message-1"],
    mode: "direct",
    offeredAgentMemberIds: ["agent:a"],
    agentId: "a",
    agentMemberId: "agent:a",
    chain: { hops: 0, invoked: ["agent:a"] },
    controlInstructions: [],
    status: "queued",
    attempts: 0,
    createdAt: T0,
    updatedAt: T0,
  };
}

function atProviderNode(): AgentHostWorkflowState {
  let workflow = createAgentHostWorkflow(job(), T0);
  workflow = beginWorkflowNode(workflow, "prepare-turn", T0);
  workflow = recordWorkflowNodeResult(
    workflow,
    "prepare-turn",
    {
      next: ["provider-turn"],
      values: { requestId: "request-1", turnId: "turn-1" },
    },
    T1,
  );
  return commitWorkflowNode(workflow, "prepare-turn", T1);
}

function startedProviderEffect(): AgentHostWorkflowState {
  const request = {
    providerId: "codex-cli",
    requestId: "request-1",
    turnId: "turn-1",
  };
  let workflow = beginWorkflowNode(atProviderNode(), "provider-turn", T1);
  workflow = prepareProviderEffect(
    workflow,
    {
      node: "provider-turn",
      requestId: request.requestId,
      turnId: request.turnId,
      inputHash: providerEffectInputHash(request),
    },
    T1,
  );
  return startProviderEffect(workflow, request.turnId, T2);
}

describe("Agent Host durable workflow", () => {
  it("commits semantic node writes into immutable checkpoints", () => {
    const workflow = atProviderNode();

    expect(workflow.checkpoints).toHaveLength(2);
    expect(workflow.checkpoint).toMatchObject({
      parentId: "job-1:checkpoint:0",
      step: 1,
      next: ["provider-turn"],
      values: { requestId: "request-1", turnId: "turn-1" },
    });
    expect(workflow.pendingWrites).toEqual([
      expect.objectContaining({ status: "committed" }),
    ]);
  });

  it("commits a durable pending write after a process restart", () => {
    let workflow = createAgentHostWorkflow(job(), T0);
    workflow = beginWorkflowNode(workflow, "prepare-turn", T0);
    workflow = recordWorkflowNodeResult(
      workflow,
      "prepare-turn",
      { next: ["provider-turn"], values: { requestId: "request-1" } },
      T1,
    );

    const recovered = recoverAgentHostWorkflow(workflow, T2);

    expect(recovered.disposition).toBe("resume");
    expect(currentWorkflowNode(recovered.workflow)).toBe("provider-turn");
    expect(recovered.workflow.pendingWrites[0].status).toBe("committed");
  });

  it("never replays a provider effect that was started without a receipt", () => {
    const recovered = recoverAgentHostWorkflow(startedProviderEffect(), T3);

    expect(recovered.disposition).toBe("uncertain");
    expect(recovered.workflow.effects[0]).toMatchObject({
      status: "uncertain",
      turnId: "turn-1",
    });
    expect(currentWorkflowNode(recovered.workflow)).toBe("provider-turn");
  });

  it("finishes a node from a committed provider receipt without rerunning it", () => {
    let workflow = startedProviderEffect();
    workflow = commitProviderEffect(
      workflow,
      "turn-1",
      { spoke: true, next: ["finalize"] },
      T2,
    );

    const recovered = recoverAgentHostWorkflow(workflow, T3);

    expect(recovered.disposition).toBe("complete");
    expect(currentWorkflowNode(recovered.workflow)).toBe("finalize");
    expect(recovered.workflow.checkpoint.values).toMatchObject({
      providerTurnCount: 1,
      spoke: true,
    });
  });

  it("rejects one effect key being reused for different provider input", () => {
    const workflow = startedProviderEffect();

    expect(() =>
      prepareProviderEffect(
        workflow,
        {
          node: "provider-turn",
          requestId: "request-1",
          turnId: "turn-1",
          inputHash: "f".repeat(64),
        },
        T3,
      ),
    ).toThrow("different input");
  });
});
