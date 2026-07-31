import { tool } from "ai";
import type { AgentTool } from "../ai/agent-tools";
import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import { errorMessage, MemoryError } from "./errors";
import {
  MEMORY_SCOPE_KINDS,
  memoryScopeKey,
  sameMemoryScope,
  type ForgetTarget,
  type MemoryActor,
  type MemoryCandidateSink,
  type MemoryPatchOperation,
  type MemoryScope,
  type MemoryStore,
} from "./types";

const toolScopeSchema = z.object({
  kind: z.enum(MEMORY_SCOPE_KINDS),
  id: z.string().trim().min(1).max(256),
});

const getContextInputSchema = z.object({
  scope: toolScopeSchema.optional(),
  format: z
    .enum(["concise", "detailed"])
    .default("concise")
    .describe(
      "concise returns labels and values; detailed also returns descriptions and provenance.",
    ),
});

const searchInputSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  scopes: z.array(toolScopeSchema).min(1).max(8).optional(),
  tags: z.array(z.string().trim().min(1).max(128)).max(16).optional(),
  maxResults: z.number().int().min(1).max(20).default(8),
});

const learnInputObjectSchema = z.object({
  scope: toolScopeSchema.optional(),
  storage: z
    .enum(["block", "archival"])
    .describe(
      "Use block for compact facts that should stay in active context; use archival for lower-priority detail retrieved by search.",
    ),
  label: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_/-]*$/)
    .optional(),
  content: z.string().trim().min(1).max(20_000),
  description: z.string().trim().min(1).max(2_000).optional(),
  tags: z.array(z.string().trim().min(1).max(128)).max(16).optional(),
});

const learnInputSchema = learnInputObjectSchema.superRefine(
  (value, context) => {
    if (value.storage === "block" && !value.label) {
      context.addIssue({
        code: "custom",
        path: ["label"],
        message: "label is required when storage is block",
      });
    }
  },
);

const correctInputSchema = z.object({
  scope: toolScopeSchema.optional(),
  memoryId: z.string().trim().min(1).max(256),
  replacement: z.string().trim().min(1).max(20_000),
  reason: z.string().trim().min(1).max(2_000),
  tags: z.array(z.string().trim().min(1).max(128)).max(16).optional(),
});

const forgetTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("block"),
    label: z.string().trim().min(1).max(128),
  }),
  z.object({
    type: z.literal("passage"),
    memoryId: z.string().trim().min(1).max(256),
  }),
  z.object({ type: z.literal("scope") }),
]);

const forgetInputSchema = z.object({
  scope: toolScopeSchema.optional(),
  target: forgetTargetSchema,
  reason: z.string().trim().min(1).max(2_000),
});

const statusInputSchema = z.object({});

const MEMORY_TOOL_DESCRIPTIONS = {
  memory_get_context:
    "Read the current structured long-term memory blocks for one allowed Convera scope. Use this when the task depends on remembered goals, decisions, preferences, or working state. Returns authoritative block values, version, epoch, staleness, and pending turn IDs; use memory_search instead for older archival details.",
  memory_search:
    "Semantically search older archival memory across one or more allowed Convera scopes. Use this for relevant facts that are not present in active memory blocks. Returns ranked, non-superseded passages and explicitly reports degraded scopes.",
  memory_learn:
    "Queue a new long-term fact for subconscious curation in an allowed Convera scope. Use block storage only for compact information that should remain active, and archival storage for details that can be searched later. The candidate is not canonical until the curator applies a versioned patch.",
  memory_correct:
    "Queue a provenance-linked correction candidate for a specific archival memory. Use only when an existing memory is demonstrably stale or wrong. The original remains canonical until subconscious curation applies a versioned replacement.",
  memory_forget:
    "Permanently remove a block, archival passage, or all Convera-managed memory in one allowed scope. This is destructive: call it only for an explicit user request, and execution always pauses for fresh approval.",
  memory_status:
    "Report local memory availability, memory versions, epochs, cached snapshots, and pending writes. Use this to diagnose stale or unavailable memory before retrying; it does not read or mutate memory content.",
} as const;

export interface MemoryToolApprovalRequest {
  toolName: "memory_forget";
  prompt: string;
  scope: MemoryScope;
  target: ForgetTarget;
  reason: string;
}

export interface CreateMemoryToolsOptions {
  store: MemoryStore;
  sourceId?: string;
  activeScope: MemoryScope;
  allowedScopes?: MemoryScope[];
  turnId: string;
  actor?: MemoryActor;
  actorId?: string;
  providerId?: string;
  now?: () => Date;
  requestApproval(
    request: MemoryToolApprovalRequest,
  ): Promise<{ approved: boolean }>;
  candidateSink: MemoryCandidateSink;
}

interface ToolError {
  ok: false;
  error: {
    code: string;
    message: string;
    resolution: string;
    retryable: boolean;
  };
}

function toolError(
  error: unknown,
  resolution: string,
  fallbackCode = "MEMORY_OPERATION_FAILED",
): ToolError {
  return {
    ok: false,
    error: {
      code: error instanceof MemoryError ? error.code : fallbackCode,
      message: errorMessage(error),
      resolution,
      retryable: error instanceof MemoryError ? error.retryable : true,
    },
  };
}

function resolveAllowedScope(
  requested: MemoryScope | undefined,
  activeScope: MemoryScope,
  allowedScopes: MemoryScope[],
): MemoryScope {
  const scope = requested ?? activeScope;
  if (!allowedScopes.some((allowed) => sameMemoryScope(allowed, scope))) {
    throw new MemoryError(
      `Scope ${memoryScopeKey(scope)} is not available to this agent turn.`,
      "APPROVAL_REQUIRED",
      false,
    );
  }
  return scope;
}

export function createMemoryTools(options: CreateMemoryToolsOptions) {
  const allowedScopes = options.allowedScopes ?? [options.activeScope];
  const now = options.now ?? (() => new Date());
  let mutationSequence = 0;

  const nextMutation = (
    scope: MemoryScope,
    operation: MemoryPatchOperation,
  ) => {
    mutationSequence += 1;
    const mutationTurnId = `${options.turnId}:memory:${mutationSequence}`;
    return {
      scope,
      turnId: mutationTurnId,
      provenance: {
        actor: options.actor ?? ("primary-agent" as const),
        actorId: options.actorId,
        turnId: mutationTurnId,
        timestamp: now().toISOString(),
        providerId: options.providerId,
      },
      operations: [operation],
    };
  };

  const memoryGetContext = tool({
    description: MEMORY_TOOL_DESCRIPTIONS.memory_get_context,
    inputSchema: getContextInputSchema,
    execute: async ({ scope: requested, format }) => {
      try {
        const scope = resolveAllowedScope(
          requested,
          options.activeScope,
          allowedScopes,
        );
        const snapshot = await options.store.getSnapshot(scope);
        return {
          ok: true,
          scope,
          version: snapshot.version,
          epoch: snapshot.epoch,
          stale: snapshot.stale,
          pendingTurnIds: snapshot.pendingTurnIds,
          checkpoint: snapshot.checkpoint,
          blocks: snapshot.blocks.map((block) =>
            format === "detailed"
              ? block
              : { label: block.label, value: block.value },
          ),
        };
      } catch (error) {
        return toolError(
          error,
          "Retry when the memory store is available, or continue using the current conversation without persistent memory.",
        );
      }
    },
  });

  const memorySearch = tool({
    description: MEMORY_TOOL_DESCRIPTIONS.memory_search,
    inputSchema: searchInputSchema,
    execute: async ({ query, scopes, tags, maxResults }) => {
      try {
        const resolved = (scopes ?? [options.activeScope]).map((scope) =>
          resolveAllowedScope(scope, options.activeScope, allowedScopes),
        );
        const result = await options.store.search({
          query,
          scopes: resolved,
          tags,
          maxResults,
        });
        return { ok: true, ...result };
      } catch (error) {
        return toolError(
          error,
          "Narrow the query or retry when the memory store is available. Do not invent a missing memory.",
        );
      }
    },
  });

  const memoryLearn = tool({
    description: MEMORY_TOOL_DESCRIPTIONS.memory_learn,
    inputSchema: learnInputSchema,
    execute: async ({
      scope: requested,
      storage,
      label,
      content,
      description,
      tags,
    }) => {
      try {
        const scope = resolveAllowedScope(
          requested,
          options.activeScope,
          allowedScopes,
        );
        const operation: MemoryPatchOperation =
          storage === "block"
            ? {
                type: "upsert_block",
                label: label as string,
                value: content,
                description,
              }
            : { type: "insert_passage", content, tags };
        const candidatePatch = nextMutation(scope, operation);
        await options.candidateSink.enqueue({
          id: candidatePatch.turnId,
          sourceId: options.sourceId,
          scope,
          turnId: candidatePatch.turnId,
          provenance: candidatePatch.provenance,
          operation: operation as Extract<
            MemoryPatchOperation,
            {
              type: "upsert_block" | "insert_passage" | "correct_passage";
            }
          >,
        });
        return {
          ok: true,
          status: "queued" as const,
          scope,
          turnId: candidatePatch.turnId,
          message:
            "Memory candidate was queued for the subconscious curator. It is not canonical until a versioned curator patch is applied.",
        };
      } catch (error) {
        return toolError(
          error,
          "Read memory_get_context for the latest version, then retry once with a smaller, non-duplicative fact.",
        );
      }
    },
  });

  const memoryCorrect = tool({
    description: MEMORY_TOOL_DESCRIPTIONS.memory_correct,
    inputSchema: correctInputSchema,
    execute: async ({
      scope: requested,
      memoryId,
      replacement,
      reason,
      tags,
    }) => {
      try {
        const scope = resolveAllowedScope(
          requested,
          options.activeScope,
          allowedScopes,
        );
        const operation = {
          type: "correct_passage" as const,
          memoryId,
          replacement,
          reason,
          tags,
        };
        const candidatePatch = nextMutation(scope, operation);
        await options.candidateSink.enqueue({
          id: candidatePatch.turnId,
          sourceId: options.sourceId,
          scope,
          turnId: candidatePatch.turnId,
          provenance: candidatePatch.provenance,
          operation,
        });
        return {
          ok: true,
          status: "queued" as const,
          scope,
          turnId: candidatePatch.turnId,
          message:
            "Correction candidate was queued for the subconscious curator. The original remains canonical until consolidation succeeds.",
        };
      } catch (error) {
        return toolError(
          error,
          "Verify the memory ID with memory_search, read the latest context version, and retry once.",
        );
      }
    },
  });

  const memoryForget = tool({
    description: MEMORY_TOOL_DESCRIPTIONS.memory_forget,
    inputSchema: forgetInputSchema,
    execute: async ({ scope: requested, target, reason }) => {
      try {
        const scope = resolveAllowedScope(
          requested,
          options.activeScope,
          allowedScopes,
        );
        const approval = await options.requestApproval({
          toolName: "memory_forget",
          prompt: `Allow permanent deletion of ${target.type} memory in ${memoryScopeKey(scope)}?\nReason: ${reason}`,
          scope,
          target,
          reason,
        });
        if (!approval.approved) {
          return {
            ok: true,
            status: "approval_required" as const,
            scope,
            message: "User denied the destructive memory deletion.",
          };
        }
        mutationSequence += 1;
        return {
          ok: true,
          ...(await options.store.forget({
            scope,
            target,
            reason,
            turnId: `${options.turnId}:forget:${mutationSequence}`,
            approved: true,
          })),
        };
      } catch (error) {
        return toolError(
          error,
          "Confirm the target scope and memory ID. Ask the user again before any retry because deletion requires fresh approval.",
        );
      }
    },
  });

  const memoryStatus = tool({
    description: MEMORY_TOOL_DESCRIPTIONS.memory_status,
    inputSchema: statusInputSchema,
    execute: async () => {
      try {
        const status = await options.store.getStatus();
        return {
          ok: true,
          ...status,
          scopes: status.scopes.filter((entry) =>
            allowedScopes.some((allowed) =>
              sameMemoryScope(allowed, entry.scope),
            ),
          ),
        };
      } catch (error) {
        return toolError(
          error,
          "Continue without persistent memory and retry status later.",
        );
      }
    },
  });

  return {
    memory_get_context: memoryGetContext,
    memory_search: memorySearch,
    memory_learn: memoryLearn,
    memory_correct: memoryCorrect,
    memory_forget: memoryForget,
    memory_status: memoryStatus,
  };
}

interface MemoryAgentToolDefinition {
  name: keyof typeof MEMORY_TOOL_DESCRIPTIONS;
  qualifiedName: `memory:${string}`;
  description: string;
  inputShape: ZodRawShape;
  inputValidator: ZodTypeAny;
}

const MEMORY_AGENT_TOOL_DEFINITIONS: MemoryAgentToolDefinition[] = [
  {
    name: "memory_get_context",
    qualifiedName: "memory:get_context",
    description: MEMORY_TOOL_DESCRIPTIONS.memory_get_context,
    inputShape: getContextInputSchema.shape,
    inputValidator: getContextInputSchema,
  },
  {
    name: "memory_search",
    qualifiedName: "memory:search",
    description: MEMORY_TOOL_DESCRIPTIONS.memory_search,
    inputShape: searchInputSchema.shape,
    inputValidator: searchInputSchema,
  },
  {
    name: "memory_learn",
    qualifiedName: "memory:learn",
    description: MEMORY_TOOL_DESCRIPTIONS.memory_learn,
    inputShape: learnInputObjectSchema.shape,
    inputValidator: learnInputSchema,
  },
  {
    name: "memory_correct",
    qualifiedName: "memory:correct",
    description: MEMORY_TOOL_DESCRIPTIONS.memory_correct,
    inputShape: correctInputSchema.shape,
    inputValidator: correctInputSchema,
  },
  {
    name: "memory_forget",
    qualifiedName: "memory:forget",
    description: MEMORY_TOOL_DESCRIPTIONS.memory_forget,
    inputShape: forgetInputSchema.shape,
    inputValidator: forgetInputSchema,
  },
  {
    name: "memory_status",
    qualifiedName: "memory:status",
    description: MEMORY_TOOL_DESCRIPTIONS.memory_status,
    inputShape: statusInputSchema.shape,
    inputValidator: statusInputSchema,
  },
];

type ExecutableTool = {
  execute?: (
    input: Record<string, unknown>,
    options?: unknown,
  ) => Promise<unknown>;
};

/**
 * Native tool catalog for the Claude Code and Codex adapters. This keeps the
 * provider boundary explicit while sharing validation and execution with the
 * AI SDK ToolSet above.
 */
export function createMemoryAgentTools(
  options: CreateMemoryToolsOptions,
): AgentTool[] {
  const tools = createMemoryTools(options);
  return MEMORY_AGENT_TOOL_DEFINITIONS.map((definition) => {
    const executable = tools[definition.name] as ExecutableTool;
    if (!executable.execute) {
      throw new Error(`${definition.name} is missing its executor.`);
    }
    const execute = executable.execute;
    return {
      name: definition.name,
      qualifiedName: definition.qualifiedName,
      description: definition.description,
      inputSchema: {
        type: "object",
        description:
          "Validated by the provider-native Zod schema exposed on inputValidator.",
      },
      inputShape: definition.inputShape,
      inputValidator: definition.inputValidator,
      execute: async (input: Record<string, unknown>) =>
        execute(definition.inputValidator.parse(input)),
    } satisfies AgentTool;
  });
}
