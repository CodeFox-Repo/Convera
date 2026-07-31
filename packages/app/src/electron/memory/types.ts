import { z } from "zod";

export const MEMORY_SCOPE_KINDS = [
  "user",
  "workspace",
  "conversation",
] as const;

export type MemoryScopeKind = (typeof MEMORY_SCOPE_KINDS)[number];

export interface MemoryScope {
  kind: MemoryScopeKind;
  id: string;
}

export const memoryScopeSchema = z.object({
  kind: z.enum(MEMORY_SCOPE_KINDS),
  id: z.string().trim().min(1).max(256),
});

export type MemoryActor = "primary-agent" | "subconscious" | "user" | "system";

export interface MemoryProvenance {
  actor: MemoryActor;
  /** Concrete channel actor that directly requested this memory mutation. */
  actorId?: string;
  /** Channel actors whose completed turns supplied a subconscious patch. */
  sourceActorIds?: string[];
  turnId: string;
  timestamp: string;
  providerId?: string;
  sourceMemoryId?: string;
}

export const memoryProvenanceSchema = z.object({
  actor: z.enum(["primary-agent", "subconscious", "user", "system"]),
  actorId: z.string().trim().min(1).max(256).optional(),
  sourceActorIds: z.array(z.string().trim().min(1).max(256)).max(64).optional(),
  turnId: z.string().trim().min(1).max(256),
  timestamp: z.string().datetime(),
  providerId: z.string().trim().min(1).max(128).optional(),
  sourceMemoryId: z.string().trim().min(1).max(256).optional(),
});

export interface MemoryBlock {
  id: string;
  scope: MemoryScope;
  label: string;
  value: string;
  description?: string;
  limit?: number;
  version: number;
  provenance: MemoryProvenance;
  updatedAt: string;
}

export interface MemoryPassage {
  id: string;
  scope: MemoryScope;
  content: string;
  tags: string[];
  score?: number;
  createdAt?: string;
  provenance?: MemoryProvenance;
  supersedes?: string;
  supersededBy?: string;
}

export interface MemoryDelta {
  version: number;
  epoch: number;
  turnId: string;
  changedBlockLabels: string[];
  summary: string;
  createdAt: string;
}

export interface MemorySnapshot {
  scope: MemoryScope;
  version: number;
  epoch: number;
  blocks: MemoryBlock[];
  deltas: MemoryDelta[];
  checkpoint?: string;
  retrievedAt: string;
  stale: boolean;
  pendingTurnIds: string[];
}

export type MemoryPatchOperation =
  | {
      type: "upsert_block";
      label: string;
      value: string;
      description?: string;
      limit?: number;
    }
  | {
      type: "insert_passage";
      content: string;
      tags?: string[];
    }
  | {
      type: "correct_passage";
      memoryId: string;
      replacement: string;
      reason: string;
      tags?: string[];
    }
  | {
      type: "set_checkpoint";
      value: string;
    }
  | {
      type: "increment_epoch";
      reason: string;
    };

const labelSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_/-]*$/,
    "Labels may contain letters, numbers, underscores, slashes, and hyphens.",
  );

const memoryPatchOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("upsert_block"),
    label: labelSchema,
    value: z.string().max(100_000),
    description: z.string().trim().min(1).max(2_000).optional(),
    limit: z.number().int().min(1).max(100_000).optional(),
  }),
  z.object({
    type: z.literal("insert_passage"),
    content: z.string().trim().min(1).max(20_000),
    tags: z.array(labelSchema).max(32).optional(),
  }),
  z.object({
    type: z.literal("correct_passage"),
    memoryId: z.string().trim().min(1).max(256),
    replacement: z.string().trim().min(1).max(20_000),
    reason: z.string().trim().min(1).max(2_000),
    tags: z.array(labelSchema).max(32).optional(),
  }),
  z.object({
    type: z.literal("set_checkpoint"),
    value: z.string().max(50_000),
  }),
  z.object({
    type: z.literal("increment_epoch"),
    reason: z.string().trim().min(1).max(2_000),
  }),
]);

export interface MemoryPatch {
  scope: MemoryScope;
  baseVersion: number;
  turnId: string;
  provenance: MemoryProvenance;
  operations: MemoryPatchOperation[];
}

export interface MemoryCandidate {
  id: string;
  /**
   * Stable memory backend identity. Legacy candidates may omit it
   * but must never be curated into an arbitrary current source.
   */
  sourceId?: string;
  scope: MemoryScope;
  turnId: string;
  provenance: MemoryProvenance;
  operation: Extract<
    MemoryPatchOperation,
    { type: "upsert_block" | "insert_passage" | "correct_passage" }
  >;
}

export interface MemoryCandidateSink {
  enqueue(candidate: MemoryCandidate): Promise<void>;
}

export const memoryPatchSchema = z
  .object({
    scope: memoryScopeSchema,
    baseVersion: z.number().int().min(0),
    turnId: z.string().trim().min(1).max(256),
    provenance: memoryProvenanceSchema,
    operations: z.array(memoryPatchOperationSchema).min(1).max(64),
  })
  .superRefine((patch, context) => {
    if (patch.provenance.turnId !== patch.turnId) {
      context.addIssue({
        code: "custom",
        path: ["provenance", "turnId"],
        message: "provenance.turnId must equal patch.turnId",
      });
    }
  });

export function validateMemoryPatch(value: unknown): MemoryPatch {
  return memoryPatchSchema.parse(value);
}

export type ApplyPatchStatus = "applied" | "duplicate" | "conflict" | "queued";

export interface ApplyPatchResult {
  status: ApplyPatchStatus;
  scope: MemoryScope;
  version: number;
  expectedVersion?: number;
  turnId: string;
  message: string;
}

export interface MemorySearchQuery {
  scopes: MemoryScope[];
  query: string;
  tags?: string[];
  maxResults?: number;
  startDate?: string;
  endDate?: string;
}

export interface MemorySearchResult {
  hits: MemoryPassage[];
  stale: boolean;
  errors: Array<{
    scope: MemoryScope;
    message: string;
  }>;
}

export interface MemoryHealth {
  available: boolean;
  checkedAt: string;
  latencyMs: number;
  detail?: string;
}

export interface MemoryStoreStatus {
  health: MemoryHealth;
  scopes: Array<{
    scope: MemoryScope;
    version: number;
    epoch: number;
    pendingWrites: number;
    cached: boolean;
  }>;
}

export type ForgetTarget =
  | { type: "block"; label: string }
  | { type: "passage"; memoryId: string }
  | { type: "scope" };

export interface ForgetRequest {
  scope: MemoryScope;
  target: ForgetTarget;
  reason: string;
  turnId: string;
  approved: boolean;
}

export interface ForgetResult {
  status: "forgotten" | "not_found" | "approval_required" | "queued";
  scope: MemoryScope;
  message: string;
}

export interface MemoryStore {
  health(): Promise<MemoryHealth>;
  getSnapshot(scope: MemoryScope): Promise<MemorySnapshot>;
  search(query: MemorySearchQuery): Promise<MemorySearchResult>;
  applyPatch(patch: MemoryPatch): Promise<ApplyPatchResult>;
  forget(request: ForgetRequest): Promise<ForgetResult>;
  flushPending(scope?: MemoryScope): Promise<ApplyPatchResult[]>;
  getStatus(): Promise<MemoryStoreStatus>;
}

export function memoryScopeKey(scope: MemoryScope): string {
  return `${scope.kind}:${scope.id}`;
}

export function sameMemoryScope(
  left: MemoryScope,
  right: MemoryScope,
): boolean {
  return left.kind === right.kind && left.id === right.id;
}
