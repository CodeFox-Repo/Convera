import { createHash } from "node:crypto";
import type {
  AgentHostJob,
  AgentHostWorkflowEffect,
  AgentHostWorkflowNode,
  AgentHostWorkflowNodeAttempt,
  AgentHostWorkflowPendingWrite,
  AgentHostWorkflowState,
} from "@/shared/types/agent-host";
import { z } from "zod";

export const AGENT_HOST_WORKFLOW_GRAPH_VERSION = "agent-host-turn-v1" as const;

const nodeSchema = z.enum([
  "prepare-turn",
  "provider-turn",
  "provider-retry",
  "finalize",
]);

const checkpointValuesSchema = z.object({
  inputHash: z.string().length(64),
  requestId: z.string().min(1).max(256).optional(),
  turnId: z.string().min(1).max(256).optional(),
  providerTurnCount: z.number().int().min(0),
  spoke: z.boolean().optional(),
  terminalStatus: z.enum(["completed", "failed"]).optional(),
  terminalError: z.string().max(16_000).optional(),
});

const checkpointSchema = z.object({
  id: z.string().min(1).max(512),
  parentId: z.string().min(1).max(512).optional(),
  step: z.number().int().min(0),
  next: z.array(nodeSchema).max(16),
  values: checkpointValuesSchema,
  committedWriteIds: z.array(z.string().min(1).max(512)).max(256),
  createdAt: z.string().datetime(),
});

const nodeAttemptSchema = z.object({
  id: z.string().min(1).max(512),
  node: nodeSchema,
  attempt: z.number().int().min(1),
  status: z.enum(["running", "completed", "failed", "interrupted"]),
  inputHash: z.string().length(64),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  error: z.string().max(16_000).optional(),
});

const pendingWriteSchema = z.object({
  id: z.string().min(1).max(512),
  checkpointId: z.string().min(1).max(512),
  attemptId: z.string().min(1).max(512),
  channel: z.literal("node-result"),
  value: z.object({
    next: z.array(nodeSchema).max(16),
    values: checkpointValuesSchema.partial(),
  }),
  status: z.enum(["pending", "committed"]),
  createdAt: z.string().datetime(),
  committedAt: z.string().datetime().optional(),
});

const effectSchema = z.object({
  id: z.string().min(1).max(768),
  attemptId: z.string().min(1).max(512),
  kind: z.literal("provider-turn"),
  idempotencyKey: z.string().min(1).max(768),
  inputHash: z.string().length(64),
  requestId: z.string().min(1).max(256),
  turnId: z.string().min(1).max(256),
  status: z.enum(["prepared", "started", "committed", "failed", "uncertain"]),
  preparedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  receipt: z
    .object({
      spoke: z.boolean(),
      next: z.array(nodeSchema).max(16),
      terminalStatus: z.enum(["completed", "failed"]).optional(),
      terminalError: z.string().max(16_000).optional(),
    })
    .optional(),
  error: z.string().max(16_000).optional(),
});

export const agentHostWorkflowSchema = z.object({
  schemaVersion: z.literal(1),
  graphVersion: z.literal(AGENT_HOST_WORKFLOW_GRAPH_VERSION),
  stateSchemaVersion: z.literal(1),
  threadId: z.string().min(1).max(256),
  checkpoint: checkpointSchema,
  checkpoints: z.array(checkpointSchema).min(1).max(256),
  attempts: z.array(nodeAttemptSchema).max(512),
  pendingWrites: z.array(pendingWriteSchema).max(512),
  effects: z.array(effectSchema).max(256),
});

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function agentHostJobInputHash(
  job: Pick<
    AgentHostJob,
    | "taskId"
    | "conversationId"
    | "triggerMessageId"
    | "contextMessageIds"
    | "agentId"
    | "agentMemberId"
    | "controlInstructions"
  >,
): string {
  return hash({
    taskId: job.taskId,
    conversationId: job.conversationId,
    triggerMessageId: job.triggerMessageId,
    contextMessageIds: job.contextMessageIds,
    agentId: job.agentId,
    agentMemberId: job.agentMemberId,
    controlInstructions: job.controlInstructions,
  });
}

export function providerEffectInputHash(input: {
  providerId: string;
  modelId?: string;
  requestId: string;
  turnId: string;
}): string {
  return hash(input);
}

export function createAgentHostWorkflow(
  job: Pick<
    AgentHostJob,
    | "id"
    | "taskId"
    | "conversationId"
    | "triggerMessageId"
    | "contextMessageIds"
    | "agentId"
    | "agentMemberId"
    | "controlInstructions"
  >,
  now: string,
): AgentHostWorkflowState {
  const inputHash = agentHostJobInputHash(job);
  const checkpoint = {
    id: `${job.id}:checkpoint:0`,
    step: 0,
    next: ["prepare-turn" as const],
    values: { inputHash, providerTurnCount: 0 },
    committedWriteIds: [],
    createdAt: now,
  };
  return agentHostWorkflowSchema.parse({
    schemaVersion: 1,
    graphVersion: AGENT_HOST_WORKFLOW_GRAPH_VERSION,
    stateSchemaVersion: 1,
    threadId: job.id,
    checkpoint,
    checkpoints: [checkpoint],
    attempts: [],
    pendingWrites: [],
    effects: [],
  }) as AgentHostWorkflowState;
}

function copy(workflow: AgentHostWorkflowState): AgentHostWorkflowState {
  return structuredClone(workflow);
}

export function currentWorkflowNode(
  workflow: AgentHostWorkflowState,
): AgentHostWorkflowNode | undefined {
  return workflow.checkpoint.next[0];
}

function currentAttempt(
  workflow: AgentHostWorkflowState,
  node = currentWorkflowNode(workflow),
): AgentHostWorkflowNodeAttempt | undefined {
  if (!node) return undefined;
  return [...workflow.attempts]
    .reverse()
    .find((attempt) => attempt.node === node);
}

export function beginWorkflowNode(
  workflow: AgentHostWorkflowState,
  node: AgentHostWorkflowNode,
  now: string,
): AgentHostWorkflowState {
  const next = currentWorkflowNode(workflow);
  if (next !== node) {
    throw new Error(`Workflow expected ${next ?? "completion"}, not ${node}.`);
  }
  const latest = currentAttempt(workflow, node);
  if (latest?.status === "running") return copy(workflow);
  const result = copy(workflow);
  const attempt =
    result.attempts.filter((candidate) => candidate.node === node).length + 1;
  result.attempts.push({
    id: `${result.threadId}:attempt:${node}:${attempt}`,
    node,
    attempt,
    status: "running",
    inputHash: result.checkpoint.values.inputHash,
    startedAt: now,
  });
  return agentHostWorkflowSchema.parse(result) as AgentHostWorkflowState;
}

export function recordWorkflowNodeResult(
  workflow: AgentHostWorkflowState,
  node: AgentHostWorkflowNode,
  result: AgentHostWorkflowPendingWrite["value"],
  now: string,
): AgentHostWorkflowState {
  const next = copy(workflow);
  const attempt = currentAttempt(next, node);
  if (!attempt || attempt.status !== "running") {
    throw new Error(`Workflow node ${node} has no running attempt.`);
  }
  attempt.status = "completed";
  attempt.completedAt = now;
  const existing = next.pendingWrites.find(
    (write) =>
      write.attemptId === attempt.id && write.channel === "node-result",
  );
  if (!existing) {
    next.pendingWrites.push({
      id: `${attempt.id}:write:node-result`,
      checkpointId: next.checkpoint.id,
      attemptId: attempt.id,
      channel: "node-result",
      value: structuredClone(result),
      status: "pending",
      createdAt: now,
    });
  }
  return agentHostWorkflowSchema.parse(next) as AgentHostWorkflowState;
}

export function commitWorkflowNode(
  workflow: AgentHostWorkflowState,
  node: AgentHostWorkflowNode,
  now: string,
): AgentHostWorkflowState {
  const next = copy(workflow);
  const attempt = currentAttempt(next, node);
  if (!attempt || attempt.status !== "completed") {
    throw new Error(`Workflow node ${node} has no completed attempt.`);
  }
  const write = next.pendingWrites.find(
    (candidate) =>
      candidate.attemptId === attempt.id &&
      candidate.channel === "node-result" &&
      candidate.status === "pending",
  );
  if (!write) throw new Error(`Workflow node ${node} has no pending result.`);
  write.status = "committed";
  write.committedAt = now;
  const checkpoint = {
    id: `${next.threadId}:checkpoint:${next.checkpoint.step + 1}`,
    parentId: next.checkpoint.id,
    step: next.checkpoint.step + 1,
    next: [...write.value.next],
    values: { ...next.checkpoint.values, ...write.value.values },
    committedWriteIds: [write.id],
    createdAt: now,
  };
  next.checkpoint = checkpoint;
  next.checkpoints.push(checkpoint);
  return agentHostWorkflowSchema.parse(next) as AgentHostWorkflowState;
}

export function prepareProviderEffect(
  workflow: AgentHostWorkflowState,
  input: {
    node: "provider-turn" | "provider-retry";
    requestId: string;
    turnId: string;
    inputHash: string;
  },
  now: string,
): AgentHostWorkflowState {
  const next = copy(workflow);
  const attempt = currentAttempt(next, input.node);
  if (!attempt || attempt.status !== "running") {
    throw new Error(`Provider node ${input.node} has no running attempt.`);
  }
  const idempotencyKey = `${next.threadId}:${input.node}:${input.turnId}`;
  const existing = next.effects.find(
    (effect) => effect.idempotencyKey === idempotencyKey,
  );
  if (existing) {
    if (existing.inputHash !== input.inputHash) {
      throw new Error("Provider effect idempotency key has different input.");
    }
    return next;
  }
  next.effects.push({
    id: `${next.threadId}:effect:${input.turnId}`,
    attemptId: attempt.id,
    kind: "provider-turn",
    idempotencyKey,
    inputHash: input.inputHash,
    requestId: input.requestId,
    turnId: input.turnId,
    status: "prepared",
    preparedAt: now,
  });
  return agentHostWorkflowSchema.parse(next) as AgentHostWorkflowState;
}

function findEffect(
  workflow: AgentHostWorkflowState,
  turnId: string,
): AgentHostWorkflowEffect {
  const effect = workflow.effects.find(
    (candidate) => candidate.turnId === turnId,
  );
  if (!effect)
    throw new Error(`Provider effect for turn ${turnId} was not prepared.`);
  return effect;
}

export function startProviderEffect(
  workflow: AgentHostWorkflowState,
  turnId: string,
  now: string,
): AgentHostWorkflowState {
  const next = copy(workflow);
  const effect = findEffect(next, turnId);
  if (effect.status === "started") return next;
  if (effect.status !== "prepared") {
    throw new Error(
      `Provider effect ${turnId} cannot start from ${effect.status}.`,
    );
  }
  effect.status = "started";
  effect.startedAt = now;
  return agentHostWorkflowSchema.parse(next) as AgentHostWorkflowState;
}

export function commitProviderEffect(
  workflow: AgentHostWorkflowState,
  turnId: string,
  receipt: NonNullable<AgentHostWorkflowEffect["receipt"]>,
  now: string,
): AgentHostWorkflowState {
  const next = copy(workflow);
  const effect = findEffect(next, turnId);
  if (effect.status === "committed") return next;
  if (effect.status !== "started") {
    throw new Error(
      `Provider effect ${turnId} cannot commit from ${effect.status}.`,
    );
  }
  effect.status = "committed";
  effect.receipt = structuredClone(receipt);
  effect.completedAt = now;
  return agentHostWorkflowSchema.parse(next) as AgentHostWorkflowState;
}

export function failProviderEffect(
  workflow: AgentHostWorkflowState,
  turnId: string,
  status: "failed" | "uncertain",
  error: string,
  now: string,
): AgentHostWorkflowState {
  const next = copy(workflow);
  const effect = findEffect(next, turnId);
  if (["committed", "failed", "uncertain"].includes(effect.status)) return next;
  effect.status = status;
  effect.error = error;
  effect.completedAt = now;
  const attempt = next.attempts.find(
    (candidate) => candidate.id === effect.attemptId,
  );
  if (attempt?.status === "running") {
    attempt.status = status === "failed" ? "failed" : "interrupted";
    attempt.error = error;
    attempt.completedAt = now;
  }
  return agentHostWorkflowSchema.parse(next) as AgentHostWorkflowState;
}

export type AgentHostWorkflowRecovery = {
  workflow: AgentHostWorkflowState;
  disposition: "resume" | "complete" | "failed" | "uncertain";
  error?: string;
};

export function recoverAgentHostWorkflow(
  workflow: AgentHostWorkflowState,
  now: string,
): AgentHostWorkflowRecovery {
  let next = copy(workflow);
  const node = currentWorkflowNode(next);
  if (!node) {
    return next.checkpoint.values.terminalStatus === "failed"
      ? {
          workflow: next,
          disposition: "failed",
          error:
            next.checkpoint.values.terminalError ??
            "The agent did not produce a deliverable output.",
        }
      : { workflow: next, disposition: "complete" };
  }
  if (node === "finalize") {
    return { workflow: next, disposition: "complete" };
  }
  const attempt = currentAttempt(next, node);
  if (!attempt) return { workflow: next, disposition: "resume" };

  const effect = [...next.effects]
    .reverse()
    .find((candidate) => candidate.attemptId === attempt.id);
  if (effect?.status === "started" || effect?.status === "uncertain") {
    const error =
      effect.error ??
      "The provider may have advanced before the application stopped. This effect was not replayed.";
    next = failProviderEffect(next, effect.turnId, "uncertain", error, now);
    return { workflow: next, disposition: "uncertain", error };
  }
  if (effect?.status === "failed") {
    return {
      workflow: next,
      disposition: "failed",
      error: effect.error ?? "The provider effect failed.",
    };
  }
  if (effect?.status === "committed" && attempt.status === "running") {
    next = recordWorkflowNodeResult(
      next,
      node,
      {
        next: effect.receipt?.next ?? ["finalize"],
        values: {
          requestId: effect.requestId,
          turnId: effect.turnId,
          providerTurnCount: next.checkpoint.values.providerTurnCount + 1,
          spoke: effect.receipt?.spoke,
          terminalStatus: effect.receipt?.terminalStatus,
          terminalError: effect.receipt?.terminalError,
        },
      },
      now,
    );
  }
  const refreshedAttempt = currentAttempt(next, node);
  if (refreshedAttempt?.status === "completed") {
    next = commitWorkflowNode(next, node, now);
    if (next.checkpoint.values.terminalStatus === "failed") {
      return {
        workflow: next,
        disposition: "failed",
        error:
          next.checkpoint.values.terminalError ??
          "The agent did not produce a deliverable output.",
      };
    }
    return {
      workflow: next,
      disposition:
        currentWorkflowNode(next) === "finalize" ? "complete" : "resume",
    };
  }
  if (refreshedAttempt?.status === "running") {
    refreshedAttempt.status = "interrupted";
    refreshedAttempt.completedAt = now;
    refreshedAttempt.error =
      "The node stopped before starting an external effect.";
  }
  return {
    workflow: agentHostWorkflowSchema.parse(next) as AgentHostWorkflowState,
    disposition: "resume",
  };
}

export function finalizeAgentHostWorkflow(
  workflow: AgentHostWorkflowState,
  now: string,
): AgentHostWorkflowState {
  if (currentWorkflowNode(workflow) === undefined) return copy(workflow);
  let next = workflow;
  if (currentWorkflowNode(next) !== "finalize") {
    throw new Error("Agent Host workflow is not ready to finalize.");
  }
  next = beginWorkflowNode(next, "finalize", now);
  next = recordWorkflowNodeResult(
    next,
    "finalize",
    { next: [], values: {} },
    now,
  );
  return commitWorkflowNode(next, "finalize", now);
}
