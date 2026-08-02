import { createHash } from "node:crypto";
import type { AgentHost } from "@/electron/agent-host/host";
import { shapeForSchema, type AgentTool } from "./agent-tools";
import type { LocalAiTurnHooks, PreparedLocalAiTurnContext } from "./runtime";
import {
  delegateTaskInputSchema,
  delegateTaskJsonSchema,
  handoffTaskInputSchema,
  handoffTaskJsonSchema,
  trustedStructuredTaskContext,
  type DelegateTaskInput,
  type DelegateTaskToolResult,
  type HandoffTaskInput,
  type HandoffTaskToolResult,
  type StructuredTaskContextRef,
  type StructuredTaskOutputContract,
  type StructuredTaskToolFailure,
  type TrustedStructuredTaskContext,
} from "./structured-task-contracts";
import { z } from "zod";

const actionSchema = z.enum([
  "list",
  "inspect",
  "pause",
  "resume",
  "cancel",
  "redirect",
]);

const inputSchema = z.object({
  action: actionSchema.describe(
    "Operation to perform. Use list before acting when the user did not provide an exact task id.",
  ),
  task_id: z
    .string()
    .min(1)
    .optional()
    .describe("Stable task id returned by list. Required except for list."),
  instruction: z
    .string()
    .min(1)
    .max(4_000)
    .optional()
    .describe(
      "Replacement guidance for redirect. The new run keeps the original task identity and applies this instruction after older guidance.",
    ),
});

type Input = z.infer<typeof inputSchema>;

function jsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: actionSchema.options,
        description:
          "Use list to discover tasks, inspect for detail, pause/resume/cancel for lifecycle control, or redirect to restart with new guidance.",
      },
      task_id: {
        type: "string",
        description:
          "Stable task id returned by list. Required except for list.",
      },
      instruction: {
        type: "string",
        minLength: 1,
        maxLength: 4_000,
        description: "Required only for redirect.",
      },
    },
    required: ["action"],
    additionalProperties: false,
  };
}

function failure(
  code: string,
  message: string,
  recovery: string,
): StructuredTaskToolFailure {
  return { ok: false, error: { code, message, recovery } };
}

const CONTROL_DESCRIPTION =
  "Inspect or control this agent's background tasks while speaking privately with the user. Use list when the user refers to a task by channel, topic, or relative time. Pause, resume, cancel, and redirect change real Agent Host state; do not claim success unless the returned ok field is true. Redirect stops the current run and starts a replacement run with the supplied private guidance.";

const READ_ONLY_DESCRIPTION =
  "Look up this agent's own background tasks. Use list to see every task and inspect for one task's detail, including its run count and latest guidance. Only list and inspect work here: pause, resume, cancel, and redirect are refused outside the agent's direct conversation with the user, because lifecycle changes carry the user's private guidance and one of the listed tasks is the run currently speaking.";

const DELEGATE_DESCRIPTION =
  "Delegate one or more bounded, independent subtasks to other agents in this channel while retaining ownership of the current task. Use workspace:read_channel first when you need exact agent member ids. The call waits for the requested all/any/quorum join and returns each child task's final status plus Dexie message ids containing its posted result. Use this for parallel specialist work that you will integrate; do not use it to transfer the whole task. Artifact and cross-agent memory references are refused until an authoritative resolver exists. Errors include recovery guidance and never mean work was created unless ok is true.";

const HANDOFF_DESCRIPTION =
  "Transfer ownership of the entire current task to one other agent in this channel. Use workspace:read_channel first when you need the exact member id. This is not delegation: on ok=true the successor keeps the same task_id, the caller is no longer the owner, and the caller should stop working without posting a completion message. Receiver-acceptance workflows are not available without the Task DAG adapter, so use acceptance=auto_if_authorized; acceptance=required returns an actionable error. The result identifies the committed successor run.";

function taskTool(
  host: AgentHost,
  agentMemberId: string,
  canControl: boolean,
): AgentTool {
  return {
    name: "manage_task",
    qualifiedName: "task:manage_task",
    description: canControl ? CONTROL_DESCRIPTION : READ_ONLY_DESCRIPTION,
    inputSchema: jsonSchema(),
    inputShape: inputSchema.shape,
    inputValidator: inputSchema,
    execute: async (raw) => {
      const input = inputSchema.parse(raw) as Input;
      if (
        !canControl &&
        input.action !== "list" &&
        input.action !== "inspect"
      ) {
        return failure(
          "TASK_CONTROL_UNAVAILABLE",
          `The ${input.action} action is only available in this agent's direct conversation with the user.`,
          "Use action=list or action=inspect here, and ask the user to change the task from your direct conversation.",
        );
      }
      const visible = (await host.listTasks(agentMemberId)).filter(
        (task) => task.channelKind !== "dm",
      );
      if (input.action === "list") {
        return {
          ok: true,
          truncated: visible.length > 20,
          tasks: visible.slice(0, 20).map((task) => ({
            task_id: task.id,
            channel_id: task.channelId,
            status: task.status,
            runs: task.runCount,
            updated_at: task.updatedAt,
            latest_guidance: task.controlInstructions.at(-1),
          })),
        };
      }

      if (!input.task_id) {
        return failure(
          "TASK_ID_REQUIRED",
          `The ${input.action} action requires task_id.`,
          "Call task:manage_task with action=list, choose one returned task_id, then retry.",
        );
      }
      const task = visible.find((candidate) => candidate.id === input.task_id);
      if (!task) {
        return failure(
          "TASK_NOT_FOUND",
          `Task ${input.task_id} is not a controllable task owned by this agent.`,
          "Call task:manage_task with action=list and use an exact task_id from the result.",
        );
      }
      if (input.action === "inspect") return { ok: true, task };

      if (input.action === "redirect") {
        if (!input.instruction) {
          return failure(
            "INSTRUCTION_REQUIRED",
            "Redirect requires a non-empty instruction.",
            "Retry with instruction describing what should change in the replacement run.",
          );
        }
        try {
          const job = await host.redirectTask(
            task.id,
            input.instruction,
            agentMemberId,
          );
          return {
            ok: true,
            task_id: job.taskId,
            job_id: job.id,
            status: job.status,
          };
        } catch (error) {
          return failure(
            "TASK_REDIRECT_FAILED",
            error instanceof Error ? error.message : String(error),
            "Inspect the task and retry after the current run reaches a safe boundary.",
          );
        }
      }

      const changed =
        input.action === "pause"
          ? await host.pauseTask(task.id, agentMemberId)
          : input.action === "resume"
            ? await host.resumeTask(task.id, agentMemberId)
            : await host.cancelTask(task.id, agentMemberId);
      if (!changed) {
        return failure(
          "TASK_STATE_CONFLICT",
          `Task ${task.id} cannot ${input.action} from status ${task.status}.`,
          "Inspect the task, then choose an action valid for its current status.",
        );
      }
      return { ok: true, task_id: task.id, action: input.action };
    },
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function inputHash(kind: "delegate" | "handoff", input: unknown): string {
  return createHash("sha256")
    .update(`${kind}:${canonicalJson(input)}`)
    .digest("hex");
}

function resolvedTarget(
  context: TrustedStructuredTaskContext,
  memberId: string,
) {
  return context.targets.find(
    (target) =>
      target.memberId === memberId &&
      target.memberId !== context.callerMemberId,
  );
}

function contextMessageIds(refs: StructuredTaskContextRef[] | undefined) {
  return (refs ?? []).flatMap((ref) =>
    ref.kind === "message" ? [ref.message_id] : [],
  );
}

function unsupportedContract(
  refs: StructuredTaskContextRef[] | undefined,
  output?: StructuredTaskOutputContract,
) {
  const unsupportedRef = refs?.find((ref) => ref.kind !== "message");
  if (unsupportedRef) {
    return failure(
      "CONTEXT_REFERENCE_UNAVAILABLE",
      `${unsupportedRef.kind} references cannot be resolved across agent sandboxes yet.`,
      "Retry with message references only, or post the necessary content in the shared channel before delegating.",
    );
  }
  if (
    output?.format === "artifact" ||
    (output?.required_artifact_kinds?.length ?? 0) > 0
  ) {
    return failure(
      "ARTIFACT_OUTPUT_UNAVAILABLE",
      "Delegated artifact output needs an authoritative artifact registry, which is not wired yet.",
      "Retry with output_contract.format=text or json and have the worker post its result to the channel.",
    );
  }
  return undefined;
}

function structuredTaskFailure(code: string, error: unknown, recovery: string) {
  return failure(
    code,
    error instanceof Error ? error.message : String(error),
    recovery,
  );
}

function delegateTaskTool(
  host: AgentHost,
  context: TrustedStructuredTaskContext,
): AgentTool {
  return {
    name: "delegate_task",
    qualifiedName: "task:delegate_task",
    description: DELEGATE_DESCRIPTION,
    inputSchema: delegateTaskJsonSchema,
    inputShape: shapeForSchema(delegateTaskJsonSchema),
    inputValidator: delegateTaskInputSchema,
    execute: async (raw): Promise<DelegateTaskToolResult> => {
      const input = delegateTaskInputSchema.parse(raw) as DelegateTaskInput;
      for (const delegate of input.delegates) {
        if (!resolvedTarget(context, delegate.assignee_member_id)) {
          return failure(
            "TARGET_NOT_AVAILABLE",
            `${delegate.assignee_member_id} is not another runnable agent in this channel.`,
            "Call workspace:read_channel, choose an agent member_id from this channel's roster, and retry.",
          );
        }
        const unsupported = unsupportedContract(
          delegate.context_refs,
          delegate.output_contract,
        );
        if (unsupported) return unsupported;
        if (
          delegate.budget?.max_turns !== undefined ||
          delegate.budget?.max_tool_calls !== undefined
        ) {
          return failure(
            "BUDGET_LIMIT_UNAVAILABLE",
            "This runtime can enforce max_output_tokens but not per-child max_turns or max_tool_calls.",
            "Retry without max_turns/max_tool_calls, or wait for the Task DAG budget adapter.",
          );
        }
      }

      try {
        const created = await host.delegateTask({
          sourceJobId: context.jobId,
          sourceTaskId: context.taskId,
          callerMemberId: context.callerMemberId,
          idempotencyKey: input.idempotency_key,
          inputHash: inputHash("delegate", input),
          ttlSeconds: input.ttl_seconds ?? 300,
          delegates: input.delegates.map((delegate) => ({
            target: resolvedTarget(context, delegate.assignee_member_id) as {
              agentId: string;
              memberId: string;
            },
            brief: {
              objective: delegate.objective,
              acceptanceCriteria: [...delegate.acceptance_criteria],
              contextMessageIds: contextMessageIds(delegate.context_refs),
              outputContract: {
                format: delegate.output_contract.format,
                description: delegate.output_contract.description,
                resultSchema: delegate.output_contract.result_schema,
              },
            },
            maxOutputTokens: delegate.budget?.max_output_tokens,
          })),
        });
        const expiresAt = created.jobs[0]?.collaboration?.expiresAt;
        const remainingMs = expiresAt
          ? Math.max(0, new Date(expiresAt).getTime() - Date.now())
          : (input.ttl_seconds ?? 300) * 1_000;
        const outcome = await host.waitForDelegation(created.operationId, {
          strategy: input.join.strategy,
          quorum: input.join.quorum,
          cancelRemainingOnSatisfied: input.join.cancel_remaining_on_satisfied,
          timeoutMs: remainingMs,
        });
        return {
          ok: true,
          delegation_id: outcome.operationId,
          parent_task_id: context.taskId,
          child_tasks: outcome.jobs.map((job) => ({
            task_id: job.taskId,
            assignee_member_id: job.agentMemberId,
            status: job.status,
            result_message_ids: [...(job.outputMessageIds ?? [])],
            ...(job.error ? { error: job.error } : {}),
          })),
          join_status: outcome.joinStatus,
        };
      } catch (error) {
        return structuredTaskFailure(
          "DELEGATION_FAILED",
          error,
          "Check that the current task is still running, use a fresh idempotency_key only for changed input, and retry once.",
        );
      }
    },
  };
}

function handoffTaskTool(
  host: AgentHost,
  context: TrustedStructuredTaskContext,
): AgentTool {
  return {
    name: "handoff_task",
    qualifiedName: "task:handoff_task",
    description: HANDOFF_DESCRIPTION,
    inputSchema: handoffTaskJsonSchema,
    inputShape: shapeForSchema(handoffTaskJsonSchema),
    inputValidator: handoffTaskInputSchema,
    execute: async (raw): Promise<HandoffTaskToolResult> => {
      const input = handoffTaskInputSchema.parse(raw) as HandoffTaskInput;
      const target = resolvedTarget(context, input.to_member_id);
      if (!target) {
        return failure(
          "TARGET_NOT_AVAILABLE",
          `${input.to_member_id} is not another runnable agent in this channel.`,
          "Call workspace:read_channel, choose an agent member_id from this channel's roster, and retry.",
        );
      }
      const unsupported = unsupportedContract(input.context_refs);
      if (unsupported) return unsupported;
      if (input.acceptance === "required") {
        return failure(
          "HANDOFF_ACCEPTANCE_UNAVAILABLE",
          "Receiver acceptance requires the Task DAG adapter and cannot be represented by Agent Host alone.",
          "Retry with acceptance=auto_if_authorized only if transferring this current task to that channel colleague is intended.",
        );
      }

      try {
        const result = await host.handoffTask({
          sourceJobId: context.jobId,
          sourceTaskId: context.taskId,
          callerMemberId: context.callerMemberId,
          idempotencyKey: input.idempotency_key,
          inputHash: inputHash("handoff", input),
          target,
          ttlSeconds: input.ttl_seconds ?? 300,
          brief: {
            objective: `Continue ownership of task ${context.taskId}.`,
            acceptanceCriteria: [input.reason],
            contextMessageIds: contextMessageIds(input.context_refs),
            outputContract: {
              format: "text",
              description:
                "Complete the transferred task and post the result in the current channel.",
            },
          },
        });
        return {
          ok: true,
          handoff_id: result.operationId,
          task_id: result.job.taskId,
          from_member_id: context.callerMemberId,
          to_member_id: result.job.agentMemberId,
          status: "committed",
        };
      } catch (error) {
        return structuredTaskFailure(
          "HANDOFF_FAILED",
          error,
          "Check that the current task is still running, use a fresh idempotency_key only for changed input, and retry once.",
        );
      }
    },
  };
}

export function withAgentHostTools(
  hooks: LocalAiTurnHooks,
  getHost: () => AgentHost | undefined,
): LocalAiTurnHooks {
  return {
    ...hooks,
    prepareTurnContext: async (
      input,
    ): Promise<PreparedLocalAiTurnContext | undefined> => {
      const prepared = await hooks.prepareTurnContext?.(input);
      const memberId = input.request.agent?.memberId?.trim();
      const host = getHost();
      const channelKind = input.request.agentHost?.channelKind;
      if (!memberId || !host || !channelKind) return prepared;
      const canControl = channelKind === "dm";
      const structuredContext = trustedStructuredTaskContext(input.request);
      const canCollaborate =
        channelKind === "channel" &&
        structuredContext !== undefined &&
        structuredContext.targets.some(
          (target) => target.memberId !== structuredContext.callerMemberId,
        );
      return {
        ...prepared,
        systemContext: [
          prepared?.systemContext,
          // Where they are standing, re-stated every turn. It rides here
          // rather than in the persona so that moving between rooms does not
          // read as becoming a different agent.
          input.request.agentHost?.roomContext,
          canControl
            ? "This is your private direct conversation with the user. You may inspect and control your background channel tasks with task:manage_task. Work state comes from that tool; do not guess from chat history."
            : "You may look up your own background tasks with task:manage_task (list and inspect only). Work state comes from that tool; do not guess from chat history.",
          canCollaborate
            ? "For bounded specialist work, task:delegate_task keeps you in control and waits for results. For a complete ownership transfer, task:handoff_task keeps the task id but makes the recipient the owner; after a successful handoff, stop working on that task. Use workspace:read_channel to obtain exact colleague member ids."
            : undefined,
        ]
          .filter(Boolean)
          .join("\n\n"),
        additionalTools: [
          ...(prepared?.additionalTools ?? []),
          taskTool(host, memberId, canControl),
          ...(canCollaborate && structuredContext
            ? [
                delegateTaskTool(host, structuredContext),
                handoffTaskTool(host, structuredContext),
              ]
            : []),
        ],
      };
    },
  };
}
