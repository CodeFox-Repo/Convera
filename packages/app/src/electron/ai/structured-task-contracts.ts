import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const STRUCTURED_TASK_CONTRACT_VERSION = 1 as const;

const opaqueIdSchema = z.string().trim().min(1).max(256);
const agentMemberIdSchema = opaqueIdSchema.refine(
  (value) => value.startsWith("agent:"),
  "Expected an agent member id.",
);
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/)
  .describe(
    "Stable key for this exact request. Reuse it only when retrying the same operation with the same input.",
  );

export const structuredTaskContextRefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("message"),
      message_id: opaqueIdSchema.describe(
        "Workspace message id. Visibility is checked when the task system resolves it.",
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("artifact"),
      artifact_id: opaqueIdSchema.describe(
        "Opaque artifact id already available to the calling agent.",
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("memory"),
      memory_id: opaqueIdSchema.describe(
        "Opaque, explicitly shareable memory reference; never a raw filesystem path.",
      ),
    })
    .strict(),
]);

export const structuredTaskOutputContractSchema = z
  .object({
    format: z
      .enum(["text", "json", "artifact"])
      .describe("Primary form the worker must return."),
    description: z
      .string()
      .trim()
      .min(1)
      .max(4_000)
      .describe("Concrete requirements for a result to count as complete."),
    result_schema: z
      .record(z.unknown())
      .refine((value) => JSON.stringify(value).length <= 16_000, {
        message: "Result schema must serialize to at most 16000 characters.",
      })
      .optional()
      .describe(
        "Optional JSON Schema-like object for structured output. It is data, not an instruction to the task runtime.",
      ),
    required_artifact_kinds: z
      .array(z.string().trim().min(1).max(64))
      .max(16)
      .optional()
      .describe("Artifact kinds that must accompany a successful result."),
  })
  .strict();

const structuredTaskBudgetSchema = z
  .object({
    max_turns: z.number().int().min(1).max(32).optional(),
    max_tool_calls: z.number().int().min(1).max(200).optional(),
    max_output_tokens: z.number().int().min(1).max(1_000_000).optional(),
  })
  .strict();

const delegateSpecSchema = z
  .object({
    assignee_member_id: agentMemberIdSchema.describe(
      "Member id of the colleague who should own this child task.",
    ),
    objective: z.string().trim().min(1).max(4_000),
    acceptance_criteria: z
      .array(z.string().trim().min(1).max(1_000))
      .min(1)
      .max(16),
    context_refs: z.array(structuredTaskContextRefSchema).max(64).optional(),
    output_contract: structuredTaskOutputContractSchema,
    budget: structuredTaskBudgetSchema.optional(),
  })
  .strict();

const joinPolicySchema = z
  .object({
    strategy: z.enum(["all", "any", "quorum"]),
    quorum: z.number().int().min(1).optional(),
    cancel_remaining_on_satisfied: z.boolean().default(true),
  })
  .strict();

export const delegateTaskInputSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    delegates: z.array(delegateSpecSchema).min(1).max(4),
    join: joinPolicySchema,
    ttl_seconds: z.number().int().min(30).max(3_600).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const assignees = input.delegates.map(
      (delegate) => delegate.assignee_member_id,
    );
    if (new Set(assignees).size !== assignees.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["delegates"],
        message: "Each assignee may appear only once in one delegation call.",
      });
    }

    if (input.join.strategy === "quorum") {
      if (input.join.quorum === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["join", "quorum"],
          message: "A quorum join requires quorum.",
        });
      } else if (input.join.quorum > input.delegates.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["join", "quorum"],
          message: "Quorum cannot exceed the number of delegates.",
        });
      }
    } else if (input.join.quorum !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["join", "quorum"],
        message: "quorum is only valid with strategy=quorum.",
      });
    }
  });

export const handoffTaskInputSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    to_member_id: agentMemberIdSchema.describe(
      "Member id of the colleague who should become the task owner.",
    ),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .describe(
        "Why ownership should move; this does not replace task intent.",
      ),
    context_refs: z.array(structuredTaskContextRefSchema).max(64).optional(),
    acceptance: z
      .enum(["required", "auto_if_authorized"])
      .default("auto_if_authorized"),
    ttl_seconds: z.number().int().min(30).max(3_600).optional(),
  })
  .strict();

export type DelegateTaskInput = z.infer<typeof delegateTaskInputSchema>;
export type HandoffTaskInput = z.infer<typeof handoffTaskInputSchema>;
export type StructuredTaskContextRef = z.infer<
  typeof structuredTaskContextRefSchema
>;
export type StructuredTaskOutputContract = z.infer<
  typeof structuredTaskOutputContractSchema
>;

/**
 * Identity supplied by Agent Host, never by model tool arguments.
 *
 * Build this only after the Host executor has rebound the request to its
 * persisted job. Tool inputs deliberately contain no task, job, caller, or
 * conversation ids, so a model cannot claim another task or another owner.
 */
export interface TrustedStructuredTaskContext {
  readonly contractVersion: typeof STRUCTURED_TASK_CONTRACT_VERSION;
  readonly taskId: string;
  readonly jobId: string;
  readonly conversationId: string;
  readonly channelKind: "channel" | "dm";
  readonly callerAgentId: string;
  readonly callerMemberId: string;
  readonly targets: ReadonlyArray<{
    readonly agentId: string;
    readonly memberId: string;
  }>;
}

export function trustedStructuredTaskContext(
  request: LocalAIChatRequest,
): TrustedStructuredTaskContext | undefined {
  const taskId = request.agentHost?.taskId.trim();
  const jobId = request.agentHost?.jobId.trim();
  const conversationId = request.conversationId.trim();
  const callerAgentId = request.agent?.id?.trim();
  const callerMemberId = request.agent?.memberId?.trim();
  const targets = request.agentHost?.collaborationTargets ?? [];
  if (
    !taskId ||
    !jobId ||
    !conversationId ||
    !callerAgentId ||
    !callerMemberId ||
    !callerMemberId.startsWith("agent:") ||
    !request.agentHost
  ) {
    return undefined;
  }

  return Object.freeze({
    contractVersion: STRUCTURED_TASK_CONTRACT_VERSION,
    taskId,
    jobId,
    conversationId,
    channelKind: request.agentHost.channelKind,
    callerAgentId,
    callerMemberId,
    targets: Object.freeze(
      targets.map((target) =>
        Object.freeze({
          agentId: target.agentId.trim(),
          memberId: target.memberId.trim(),
        }),
      ),
    ),
  });
}

function jsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  }) as Record<string, unknown>;
}

/** JSON schemas exposed to providers when the tools are wired later. */
export const delegateTaskJsonSchema = jsonSchema(delegateTaskInputSchema);
export const handoffTaskJsonSchema = jsonSchema(handoffTaskInputSchema);

export type DelegateTaskToolResult =
  | {
      ok: true;
      delegation_id: string;
      parent_task_id: string;
      child_tasks: Array<{
        task_id: string;
        assignee_member_id: string;
        status:
          | "queued"
          | "running"
          | "paused"
          | "uncertain"
          | "completed"
          | "failed"
          | "cancelled"
          | "interrupted";
        result_message_ids: string[];
        error?: string;
      }>;
      join_status: "satisfied" | "partial" | "expired";
    }
  | StructuredTaskToolFailure;

export type HandoffTaskToolResult =
  | {
      ok: true;
      handoff_id: string;
      task_id: string;
      from_member_id: string;
      to_member_id: string;
      status: "proposed" | "committed";
    }
  | StructuredTaskToolFailure;

export interface StructuredTaskToolFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    recovery?: string;
  };
}
