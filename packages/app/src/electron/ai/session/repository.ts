import { app } from "electron";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { LocalAITurnRuntimeState } from "@/shared/types/local-ai";
import { LOCAL_AI_PROVIDER_IDS, type LocalAiProviderId } from "../types";
import {
  LOCAL_AI_RUNTIME_STATE_SCHEMA_VERSION,
  SessionStateError,
  type BeginSessionTurnInput,
  type CompleteSessionTurnInput,
  type ConversationDeletionRecord,
  type ConversationSessionState,
  type DurableMemoryTurnHookPayload,
  type DurableTurnHookRecord,
  type LocalAiRuntimeState,
  type PreparedSessionTurn,
  type ProviderSessionBinding,
  type SessionStateRepository,
  type SessionTurnRecord,
} from "./types";

type Clock = () => Date;

interface JsonSessionStateRepositoryOptions {
  path: string;
  clock?: Clock;
}

interface InMemorySessionStateRepositoryOptions {
  clock?: Clock;
  initialState?: LocalAiRuntimeState;
}

function emptyState(): LocalAiRuntimeState {
  return {
    schemaVersion: LOCAL_AI_RUNTIME_STATE_SCHEMA_VERSION,
    conversations: [],
    bindings: [],
    turns: [],
    deletions: [],
    turnHooks: [],
  };
}

export const TURN_RECOVERY_TEXT_LIMIT = 200_000;
export const TURN_HOOK_TEXT_LIMIT = 100_000;
export const TURN_HOOK_RETRY_BASE_MS = 5_000;
export const ACKNOWLEDGED_TURNS_PER_CONVERSATION_LIMIT = 100;
export const ACKNOWLEDGED_TURNS_GLOBAL_LIMIT = 1_000;
export const COMPLETED_DELETION_TOMBSTONE_LIMIT = 1_000;
export const TURN_RECOVERY_TRUNCATION_MARKER =
  "\n[Convera recovery truncated]\n";
export const TURN_HOOK_TRUNCATION_MARKER =
  "\n[Convera memory hook truncated]\n";

function boundText(
  value: string,
  limit: number,
  marker: string,
): {
  text: string;
  truncated: boolean;
} {
  if (value.length <= limit) {
    return { text: value, truncated: false };
  }
  const available = limit - marker.length;
  const headLength = Math.ceil(available / 2);
  const tailLength = available - headLength;
  return {
    text:
      value.slice(0, headLength) +
      marker +
      value.slice(value.length - tailLength),
    truncated: true,
  };
}

function boundTurnRecoveryText(value: string) {
  return boundText(
    value,
    TURN_RECOVERY_TEXT_LIMIT,
    TURN_RECOVERY_TRUNCATION_MARKER,
  );
}

function boundTurnHookText(value: string) {
  return boundText(value, TURN_HOOK_TEXT_LIMIT, TURN_HOOK_TRUNCATION_MARKER);
}

function pruneAcknowledgedTurnMetadata(state: LocalAiRuntimeState): void {
  const retainedHookTurns = new Set(
    (state.turnHooks ?? []).map((hook) => hook.turnId),
  );
  const eligible = state.turns.filter(
    (turn) =>
      turn.rendererPersistedAt !== undefined &&
      turn.status !== "pending" &&
      turn.status !== "uncertain" &&
      !retainedHookTurns.has(turn.turnId),
  );
  const newestFirst = (left: SessionTurnRecord, right: SessionTurnRecord) =>
    (right.completedAt ?? right.startedAt).localeCompare(
      left.completedAt ?? left.startedAt,
    );
  const remove = new Set<string>();
  const byConversation = new Map<string, SessionTurnRecord[]>();
  for (const turn of eligible) {
    const turns = byConversation.get(turn.conversationId) ?? [];
    turns.push(turn);
    byConversation.set(turn.conversationId, turns);
  }
  for (const turns of byConversation.values()) {
    turns
      .sort(newestFirst)
      .slice(ACKNOWLEDGED_TURNS_PER_CONVERSATION_LIMIT)
      .forEach((turn) => remove.add(turn.turnId));
  }
  eligible
    .filter((turn) => !remove.has(turn.turnId))
    .sort(newestFirst)
    .slice(ACKNOWLEDGED_TURNS_GLOBAL_LIMIT)
    .forEach((turn) => remove.add(turn.turnId));
  if (remove.size > 0) {
    state.turns = state.turns.filter((turn) => !remove.has(turn.turnId));
  }
}

function pruneCompletedDeletionTombstones(state: LocalAiRuntimeState): void {
  const deletions = state.deletions ?? [];
  const deleting = deletions.filter(
    (deletion) => deletion.status === "deleting",
  );
  const completed = deletions
    .filter((deletion) => deletion.status === "completed")
    .sort((left, right) =>
      (right.completedAt ?? right.updatedAt).localeCompare(
        left.completedAt ?? left.updatedAt,
      ),
    )
    .slice(0, COMPLETED_DELETION_TOMBSTONE_LIMIT);
  state.deletions = [...deleting, ...completed];
}

function cloneState<T>(value: T): T {
  return structuredClone(value);
}

export const DEFAULT_LOCAL_AI_ACTOR_ID = "actor:default";

function normalizedActorId(actorId: string | undefined): string {
  return actorId?.trim() || DEFAULT_LOCAL_AI_ACTOR_ID;
}

function bindingMatches(
  binding: ProviderSessionBinding,
  conversationId: string,
  providerId: string,
  revision: number,
  actorId?: string,
): boolean {
  return (
    binding.conversationId === conversationId &&
    normalizedActorId(binding.actorId) === normalizedActorId(actorId) &&
    binding.providerId === providerId &&
    binding.revision === revision
  );
}

const identifierSchema = z.string().trim().min(1).max(4_096);
const timestampSchema = z.string().datetime();
// Derived, never re-listed: a second hardcoded copy silently invalidates every
// state file the moment a provider is added.
const providerIdSchema: z.ZodType<LocalAiProviderId> = z.enum(
  LOCAL_AI_PROVIDER_IDS,
);
const rebaseReasonSchema = z.enum(["edit", "regenerate", "provider-switch"]);
const memoryCursorSchema = z
  .object({
    version: z.number().int().min(0),
    epoch: z.number().int().min(0),
  })
  .strict();
const conversationSchema = z
  .object({
    conversationId: identifierSchema,
    revision: z.number().int().min(0),
    transcriptVersion: z.number().int().min(0),
    lastCompletedProviderId: providerIdSchema.optional(),
    memoryEpoch: z.number().int().min(0),
    memoryVersion: z.number().int().min(0),
    updatedAt: timestampSchema,
  })
  .strict();
const conversationDeletionSchema = z
  .object({
    conversationId: identifierSchema,
    operationId: identifierSchema,
    forgetConversationMemory: z.boolean(),
    status: z.enum(["deleting", "completed"]),
    startedAt: timestampSchema,
    updatedAt: timestampSchema,
    completedAt: timestampSchema.optional(),
    lastError: z.string().max(100_000).optional(),
  })
  .strict();
const durableMemoryScopeSchema = z
  .object({
    kind: z.enum(["user", "workspace", "conversation"]),
    id: identifierSchema,
  })
  .strict();
const durableMemoryTurnHookPayloadSchema = z
  .object({
    kind: z.literal("memory-turn"),
    sourceId: identifierSchema.optional(),
    turnId: identifierSchema,
    conversationId: identifierSchema,
    actorId: identifierSchema.optional(),
    revision: z.number().int().min(0),
    providerId: providerIdSchema,
    scopes: z.array(durableMemoryScopeSchema).min(1).max(3),
    userContent: z.string().max(TURN_HOOK_TEXT_LIMIT),
    userContentTruncated: z.boolean().optional(),
    assistantContent: z.string().max(TURN_HOOK_TEXT_LIMIT).optional(),
    assistantContentTruncated: z.boolean().optional(),
  })
  .strict();
const durableTurnHookSchema = z
  .object({
    hookId: identifierSchema,
    turnId: identifierSchema,
    conversationId: identifierSchema,
    outcome: z.enum(["completed", "failed"]).optional(),
    status: z.enum(["armed", "pending"]),
    payload: durableMemoryTurnHookPayloadSchema,
    attempts: z.number().int().min(0),
    retryable: z.boolean(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    terminalAt: timestampSchema.optional(),
    nextAttemptAt: timestampSchema.optional(),
    lastError: z.string().max(100_000).optional(),
    pauseReason: z.literal("configuration").optional(),
  })
  .strict();
const bindingSchema = z
  .object({
    conversationId: identifierSchema,
    actorId: identifierSchema.optional(),
    providerId: providerIdSchema,
    revision: z.number().int().min(0),
    transcriptVersion: z.number().int().min(0),
    nativeSessionId: identifierSchema,
    cwd: z.string().min(1).max(32_768),
    modelId: z.string().min(1).max(4_096).optional(),
    stale: z.boolean(),
    memoryCursors: z.record(identifierSchema, memoryCursorSchema).optional(),
    contextFingerprint: identifierSchema.optional(),
    updatedAt: timestampSchema,
  })
  .strict();
const turnSchema = z
  .object({
    turnId: identifierSchema,
    requestId: identifierSchema,
    conversationId: identifierSchema,
    actorId: identifierSchema.optional(),
    providerId: providerIdSchema,
    revision: z.number().int().min(0),
    operation: z.enum(["append", "bootstrap", "rebase"]),
    operationReason: rebaseReasonSchema.optional(),
    status: z.enum([
      "pending",
      "completed",
      "failed",
      "aborted",
      "uncertain",
      "interrupted",
    ]),
    startedAt: timestampSchema,
    providerStartedAt: timestampSchema.optional(),
    completedAt: timestampSchema.optional(),
    nativeSessionId: identifierSchema.optional(),
    modelId: z.string().min(1).max(4_096).optional(),
    finishReason: z
      .enum([
        "stop",
        "length",
        "content-filter",
        "tool-calls",
        "error",
        "aborted",
        "unknown",
      ])
      .optional(),
    assistantText: z.string().max(TURN_RECOVERY_TEXT_LIMIT).optional(),
    assistantTextTruncated: z.boolean().optional(),
    rendererPersistedAt: timestampSchema.optional(),
    error: z.string().max(100_000).optional(),
  })
  .strict();
const runtimeStateSchema = z
  .object({
    schemaVersion: z.literal(LOCAL_AI_RUNTIME_STATE_SCHEMA_VERSION),
    conversations: z.array(conversationSchema).max(100_000),
    bindings: z.array(bindingSchema).max(200_000),
    turns: z.array(turnSchema).max(500_000),
    // schema-v2 files written before durable deletion do not contain this key.
    deletions: z.array(conversationDeletionSchema).max(100_000).optional(),
    turnHooks: z.array(durableTurnHookSchema).max(500_000).optional(),
  })
  .strict();
const legacyRuntimeStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    conversations: z
      .array(
        conversationSchema.omit({
          transcriptVersion: true,
          lastCompletedProviderId: true,
        }),
      )
      .max(100_000),
    bindings: z
      .array(bindingSchema.omit({ transcriptVersion: true }))
      .max(200_000),
    turns: z.array(turnSchema.omit({ operationReason: true })).max(500_000),
  })
  .strict();

function migrateLegacyState(value: unknown): unknown {
  const parsed = legacyRuntimeStateSchema.safeParse(value);
  if (!parsed.success) return value;

  const legacy = parsed.data;
  const completedByConversation = new Map<string, typeof legacy.turns>();
  for (const turn of legacy.turns) {
    if (turn.status !== "completed") continue;
    const completed = completedByConversation.get(turn.conversationId) ?? [];
    completed.push(turn);
    completedByConversation.set(turn.conversationId, completed);
  }
  const transcriptVersions = new Map(
    legacy.conversations.map((conversation) => [
      conversation.conversationId,
      completedByConversation.get(conversation.conversationId)?.length ?? 0,
    ]),
  );

  return {
    schemaVersion: LOCAL_AI_RUNTIME_STATE_SCHEMA_VERSION,
    conversations: legacy.conversations.map((conversation) => {
      const completed =
        completedByConversation.get(conversation.conversationId) ?? [];
      return {
        ...conversation,
        transcriptVersion: completed.length,
        lastCompletedProviderId: completed.at(-1)?.providerId,
      };
    }),
    bindings: legacy.bindings.map((binding) => ({
      ...binding,
      transcriptVersion: 0,
      stale:
        binding.stale ||
        (transcriptVersions.get(binding.conversationId) ?? 0) > 0,
    })),
    turns: legacy.turns,
  } satisfies LocalAiRuntimeState;
}

function assertState(value: unknown): asserts value is LocalAiRuntimeState {
  const parsed = runtimeStateSchema.safeParse(value);
  if (!parsed.success) {
    throw new SessionStateError(
      "Local AI runtime state has an unsupported or invalid schema.",
      "LOCAL_AI_SESSION_STATE_INVALID",
    );
  }
  const state = parsed.data;
  const conversations = new Map(
    state.conversations.map((conversation) => [
      conversation.conversationId,
      conversation,
    ]),
  );
  const uniqueTurnIds = new Set(state.turns.map((turn) => turn.turnId));
  const uniqueDeletionIds = new Set(
    (state.deletions ?? []).map((deletion) => deletion.conversationId),
  );
  const uniqueBindings = new Set(
    state.bindings.map(
      (binding) =>
        `${binding.conversationId}\0${normalizedActorId(binding.actorId)}\0${binding.providerId}\0${binding.revision}`,
    ),
  );
  const structurallyConsistent =
    conversations.size === state.conversations.length &&
    uniqueTurnIds.size === state.turns.length &&
    uniqueDeletionIds.size === (state.deletions ?? []).length &&
    new Set((state.turnHooks ?? []).map((hook) => hook.hookId)).size ===
      (state.turnHooks ?? []).length &&
    uniqueBindings.size === state.bindings.length &&
    state.bindings.every((binding) => {
      const conversation = conversations.get(binding.conversationId);
      return (
        conversation &&
        binding.revision <= conversation.revision &&
        binding.transcriptVersion <= conversation.transcriptVersion
      );
    }) &&
    state.turns.every((turn) => {
      const conversation = conversations.get(turn.conversationId);
      return conversation && turn.revision <= conversation.revision;
    }) &&
    (state.turnHooks ?? []).every((hook) => {
      const turn = state.turns.find(
        (candidate) => candidate.turnId === hook.turnId,
      );
      return (
        turn !== undefined &&
        turn.conversationId === hook.conversationId &&
        hook.payload.turnId === hook.turnId &&
        hook.payload.conversationId === hook.conversationId &&
        (hook.pauseReason === undefined ||
          (hook.status === "pending" && !hook.retryable)) &&
        (hook.status === "armed"
          ? hook.outcome === undefined && hook.terminalAt === undefined
          : hook.outcome !== undefined && hook.terminalAt !== undefined)
      );
    }) &&
    (state.deletions ?? []).every(
      (deletion) =>
        deletion.status === "deleting" || deletion.completedAt !== undefined,
    );
  if (!structurallyConsistent) {
    throw new SessionStateError(
      "Local AI runtime state contains inconsistent conversation references.",
      "LOCAL_AI_SESSION_STATE_INVALID",
    );
  }
}

function beginTurn(
  state: LocalAiRuntimeState,
  input: BeginSessionTurnInput,
  now: string,
): PreparedSessionTurn {
  const deletion = (state.deletions ?? []).find(
    (candidate) => candidate.conversationId === input.conversationId,
  );
  if (deletion) {
    throw new SessionStateError(
      `Conversation is ${deletion.status}: ${input.conversationId}`,
      deletion.status === "deleting"
        ? "LOCAL_AI_CONVERSATION_DELETING"
        : "LOCAL_AI_CONVERSATION_DELETED",
    );
  }
  if (state.turns.some((turn) => turn.turnId === input.turnId)) {
    throw new SessionStateError(
      `Turn already exists: ${input.turnId}`,
      "LOCAL_AI_DUPLICATE_TURN",
    );
  }

  let conversation = state.conversations.find(
    (candidate) => candidate.conversationId === input.conversationId,
  );
  if (!conversation) {
    conversation = {
      conversationId: input.conversationId,
      revision: 0,
      transcriptVersion: 0,
      memoryEpoch: 0,
      memoryVersion: 0,
      updatedAt: now,
    };
    state.conversations.push(conversation);
  }

  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== conversation.revision
  ) {
    throw new SessionStateError(
      `Conversation revision changed from ${input.expectedRevision} to ${conversation.revision}.`,
      "LOCAL_AI_STALE_REVISION",
    );
  }

  const currentBinding = state.bindings.find((candidate) =>
    bindingMatches(
      candidate,
      input.conversationId,
      input.providerId,
      conversation.revision,
      input.actorId,
    ),
  );
  const currentRevisionIsUncertain = state.turns.some(
    (turn) =>
      turn.conversationId === input.conversationId &&
      turn.providerId === input.providerId &&
      normalizedActorId(turn.actorId) === normalizedActorId(input.actorId) &&
      turn.revision === conversation.revision &&
      turn.status === "uncertain",
  );
  const providerSwitchRequired =
    conversation.lastCompletedProviderId !== undefined &&
    conversation.lastCompletedProviderId !== input.providerId;
  if (providerSwitchRequired && input.operation !== "rebase") {
    throw new SessionStateError(
      `The shared transcript advanced with ${conversation.lastCompletedProviderId}. Rebase ${input.providerId} from the visible transcript before continuing.`,
      "LOCAL_AI_PROVIDER_REBASE_REQUIRED",
    );
  }
  if (
    input.operation === "append" &&
    (currentBinding?.stale === true || currentRevisionIsUncertain)
  ) {
    throw new SessionStateError(
      "The provider session may contain an uncommitted turn. Bootstrap or rebase before continuing.",
      "LOCAL_AI_SESSION_REBASE_REQUIRED",
    );
  }
  if (
    input.operation !== "rebase" &&
    conversation.transcriptVersion > 0 &&
    currentBinding !== undefined &&
    currentBinding.transcriptVersion !== conversation.transcriptVersion
  ) {
    throw new SessionStateError(
      "The provider session does not include the latest shared transcript. Rebase it before continuing.",
      "LOCAL_AI_PROVIDER_REBASE_REQUIRED",
    );
  }
  if (
    input.operation === "append" &&
    conversation.transcriptVersion > 0 &&
    currentBinding === undefined
  ) {
    throw new SessionStateError(
      "The provider session does not include the latest shared transcript. Rebase it before continuing.",
      "LOCAL_AI_PROVIDER_REBASE_REQUIRED",
    );
  }
  const bootstrapRecoversUncertainSession =
    input.operation === "bootstrap" &&
    (currentBinding?.stale === true || currentRevisionIsUncertain);

  if (input.operation === "rebase" || bootstrapRecoversUncertainSession) {
    conversation.revision += 1;
    conversation.updatedAt = now;
  }

  const binding = state.bindings.find((candidate) =>
    bindingMatches(
      candidate,
      input.conversationId,
      input.providerId,
      conversation.revision,
      input.actorId,
    ),
  );

  const turn: SessionTurnRecord = {
    turnId: input.turnId,
    requestId: input.requestId,
    conversationId: input.conversationId,
    actorId: normalizedActorId(input.actorId),
    providerId: input.providerId,
    revision: conversation.revision,
    operation: input.operation,
    operationReason: input.operationReason,
    status: "pending",
    startedAt: now,
  };
  state.turns.push(turn);

  return cloneState({ turn, conversation, binding });
}

function invalidateBinding(
  state: LocalAiRuntimeState,
  conversationId: string,
  providerId: string,
  revision: number,
  now: string,
  actorId?: string,
): void {
  const binding = state.bindings.find((candidate) =>
    bindingMatches(candidate, conversationId, providerId, revision, actorId),
  );
  if (!binding) return;
  binding.stale = true;
  binding.updatedAt = now;
}

function armTurnHook(
  state: LocalAiRuntimeState,
  turnId: string,
  payload: DurableMemoryTurnHookPayload,
  now: string,
): DurableTurnHookRecord {
  const boundedUser = boundTurnHookText(payload.userContent);
  const decoded = durableMemoryTurnHookPayloadSchema.safeParse({
    ...payload,
    userContent: boundedUser.text,
    userContentTruncated: boundedUser.truncated || undefined,
    assistantContent: undefined,
    assistantContentTruncated: undefined,
  });
  if (!decoded.success) {
    throw new SessionStateError(
      `Durable turn hook payload is invalid: ${turnId}`,
      "LOCAL_AI_TURN_HOOK_INVALID",
    );
  }
  payload = decoded.data;
  const turn = state.turns.find((candidate) => candidate.turnId === turnId);
  if (!turn || turn.status !== "pending") {
    throw new SessionStateError(
      `Pending turn not found: ${turnId}`,
      "LOCAL_AI_TURN_NOT_PENDING",
    );
  }
  if (
    payload.turnId !== turnId ||
    payload.conversationId !== turn.conversationId ||
    payload.providerId !== turn.providerId ||
    payload.revision !== turn.revision
  ) {
    throw new SessionStateError(
      `Durable turn hook does not match its turn: ${turnId}`,
      "LOCAL_AI_TURN_HOOK_INVALID",
    );
  }
  const existing = (state.turnHooks ??= []).find(
    (hook) => hook.turnId === turnId,
  );
  if (existing) return cloneState(existing);
  const hook: DurableTurnHookRecord = {
    hookId: turnId,
    turnId,
    conversationId: turn.conversationId,
    status: "armed",
    payload: {
      ...cloneState(payload),
      userContent: payload.userContent,
      userContentTruncated: payload.userContentTruncated,
      assistantContent: undefined,
      assistantContentTruncated: undefined,
    },
    attempts: 0,
    retryable: true,
    createdAt: now,
    updatedAt: now,
  };
  state.turnHooks.push(hook);
  return cloneState(hook);
}

function makeTurnHookPending(
  state: LocalAiRuntimeState,
  turnId: string,
  outcome: DurableTurnHookRecord["outcome"],
  now: string,
  assistantContent?: string,
): void {
  const hook = (state.turnHooks ?? []).find(
    (candidate) => candidate.turnId === turnId,
  );
  if (!hook) return;
  hook.status = "pending";
  hook.outcome = outcome;
  hook.updatedAt = now;
  hook.terminalAt = now;
  hook.retryable = true;
  hook.attempts = 0;
  delete hook.lastError;
  delete hook.pauseReason;
  delete hook.nextAttemptAt;
  if (outcome === "completed") {
    const assistant = boundTurnHookText(assistantContent ?? "");
    hook.payload.assistantContent = assistant.text;
    hook.payload.assistantContentTruncated = assistant.truncated || undefined;
  } else {
    delete hook.payload.assistantContent;
    delete hook.payload.assistantContentTruncated;
  }
}

function completeTurn(
  state: LocalAiRuntimeState,
  input: CompleteSessionTurnInput,
  now: string,
): ProviderSessionBinding {
  const turn = state.turns.find(
    (candidate) => candidate.turnId === input.turnId,
  );
  if (!turn || turn.status !== "pending") {
    throw new SessionStateError(
      `Pending turn not found: ${input.turnId}`,
      "LOCAL_AI_TURN_NOT_PENDING",
    );
  }

  const nativeSessionId = input.nativeSessionId.trim();
  if (!nativeSessionId) {
    throw new SessionStateError(
      "Provider returned an empty native session id.",
      "LOCAL_AI_SESSION_METADATA_INVALID",
    );
  }

  const bindingIndex = state.bindings.findIndex((candidate) =>
    bindingMatches(
      candidate,
      turn.conversationId,
      turn.providerId,
      turn.revision,
      turn.actorId,
    ),
  );
  const existingBinding =
    bindingIndex === -1 ? undefined : state.bindings[bindingIndex];
  const conversation = state.conversations.find(
    (candidate) => candidate.conversationId === turn.conversationId,
  );
  if (!conversation) {
    throw new SessionStateError(
      `Conversation not found for turn: ${turn.turnId}`,
      "LOCAL_AI_CONVERSATION_NOT_FOUND",
    );
  }
  const transcriptVersion = conversation.transcriptVersion + 1;
  const binding: ProviderSessionBinding = {
    conversationId: turn.conversationId,
    actorId: normalizedActorId(turn.actorId),
    providerId: turn.providerId,
    revision: turn.revision,
    nativeSessionId,
    cwd: input.cwd,
    modelId: input.modelId,
    stale: false,
    transcriptVersion,
    memoryCursors: cloneState(
      input.memoryCursors ?? existingBinding?.memoryCursors ?? {},
    ),
    contextFingerprint: input.contextFingerprint,
    updatedAt: now,
  };
  if (bindingIndex === -1) {
    state.bindings.push(binding);
  } else {
    state.bindings[bindingIndex] = binding;
  }

  turn.status = "completed";
  turn.completedAt = now;
  turn.nativeSessionId = nativeSessionId;
  turn.modelId = input.modelId;
  turn.finishReason = input.finishReason ?? "stop";
  const recoveryText = boundTurnRecoveryText(input.assistantText ?? "");
  turn.assistantText = recoveryText.text;
  if (recoveryText.truncated) {
    turn.assistantTextTruncated = true;
  }

  conversation.transcriptVersion = transcriptVersion;
  conversation.lastCompletedProviderId = turn.providerId;
  conversation.updatedAt = now;
  makeTurnHookPending(
    state,
    turn.turnId,
    "completed",
    now,
    input.assistantHookContent ?? input.assistantText,
  );
  return cloneState(binding);
}

function failTurn(
  state: LocalAiRuntimeState,
  turnId: string,
  status: "failed" | "aborted" | "uncertain",
  error: string | undefined,
  now: string,
): void {
  const turn = state.turns.find((candidate) => candidate.turnId === turnId);
  if (!turn || turn.status !== "pending") return;
  turn.status = status;
  turn.completedAt = now;
  turn.finishReason = status === "aborted" ? "aborted" : "error";
  if (error) turn.error = error;
  if (status === "uncertain") {
    invalidateBinding(
      state,
      turn.conversationId,
      turn.providerId,
      turn.revision,
      now,
      turn.actorId,
    );
  }
  makeTurnHookPending(state, turnId, "failed", now);
}

abstract class SerializedSessionStateRepository
  implements SessionStateRepository
{
  private queue: Promise<void> = Promise.resolve();

  protected constructor(private readonly clock: Clock) {}

  protected abstract readState(): Promise<LocalAiRuntimeState>;
  protected abstract writeState(state: LocalAiRuntimeState): Promise<void>;

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private transact<T>(
    mutate: (state: LocalAiRuntimeState, now: string) => T,
  ): Promise<T> {
    return this.serialize(async () => {
      const state = await this.readState();
      const next = cloneState(state);
      const result = mutate(next, this.clock().toISOString());
      await this.writeState(next);
      return result;
    });
  }

  private read<T>(select: (state: LocalAiRuntimeState) => T): Promise<T> {
    return this.serialize(async () =>
      select(cloneState(await this.readState())),
    );
  }

  beginTurn(input: BeginSessionTurnInput): Promise<PreparedSessionTurn> {
    return this.transact((state, now) => beginTurn(state, input, now));
  }

  armTurnHook(
    turnId: string,
    payload: DurableMemoryTurnHookPayload,
  ): Promise<DurableTurnHookRecord> {
    return this.transact((state, now) =>
      armTurnHook(state, turnId, payload, now),
    );
  }

  completeTurn(
    input: CompleteSessionTurnInput,
  ): Promise<ProviderSessionBinding> {
    return this.transact((state, now) => completeTurn(state, input, now));
  }

  markProviderStarted(turnId: string): Promise<void> {
    return this.transact((state, now) => {
      const turn = state.turns.find((candidate) => candidate.turnId === turnId);
      if (!turn || turn.status !== "pending") {
        throw new SessionStateError(
          `Pending turn not found: ${turnId}`,
          "LOCAL_AI_TURN_NOT_PENDING",
        );
      }
      turn.providerStartedAt = now;
    });
  }

  rotatePendingTurn(turnId: string): Promise<PreparedSessionTurn> {
    return this.transact((state, now) => {
      const turn = state.turns.find((candidate) => candidate.turnId === turnId);
      if (!turn || turn.status !== "pending" || turn.providerStartedAt) {
        throw new SessionStateError(
          `Turn cannot rotate its provider session: ${turnId}`,
          "LOCAL_AI_TURN_NOT_ROTATABLE",
        );
      }
      const conversation = state.conversations.find(
        (candidate) => candidate.conversationId === turn.conversationId,
      );
      if (!conversation) {
        throw new SessionStateError(
          `Conversation not found for turn: ${turnId}`,
          "LOCAL_AI_CONVERSATION_NOT_FOUND",
        );
      }

      conversation.revision += 1;
      conversation.updatedAt = now;
      turn.revision = conversation.revision;
      return cloneState({
        turn,
        conversation,
        binding: undefined,
      });
    });
  }

  invalidateBinding(
    conversationId: string,
    providerId: ProviderSessionBinding["providerId"],
    revision: number,
    actorId?: string,
  ): Promise<void> {
    return this.transact((state, now) =>
      invalidateBinding(
        state,
        conversationId,
        providerId,
        revision,
        now,
        actorId,
      ),
    );
  }

  setConversationMemoryState(
    conversationId: string,
    memoryState: { memoryVersion: number; memoryEpoch: number },
  ): Promise<ConversationSessionState> {
    return this.transact((state, now) => {
      const deletion = (state.deletions ?? []).find(
        (candidate) => candidate.conversationId === conversationId,
      );
      if (deletion) {
        throw new SessionStateError(
          `Conversation is ${deletion.status}: ${conversationId}`,
          deletion.status === "deleting"
            ? "LOCAL_AI_CONVERSATION_DELETING"
            : "LOCAL_AI_CONVERSATION_DELETED",
        );
      }
      if (
        !Number.isInteger(memoryState.memoryVersion) ||
        memoryState.memoryVersion < 0 ||
        !Number.isInteger(memoryState.memoryEpoch) ||
        memoryState.memoryEpoch < 0
      ) {
        throw new SessionStateError(
          "Memory version and epoch must be non-negative integers.",
          "LOCAL_AI_MEMORY_STATE_INVALID",
        );
      }
      let conversation = state.conversations.find(
        (candidate) => candidate.conversationId === conversationId,
      );
      if (!conversation) {
        conversation = {
          conversationId,
          revision: 0,
          transcriptVersion: 0,
          memoryEpoch: memoryState.memoryEpoch,
          memoryVersion: memoryState.memoryVersion,
          updatedAt: now,
        };
        state.conversations.push(conversation);
      } else {
        conversation.memoryEpoch = memoryState.memoryEpoch;
        conversation.memoryVersion = memoryState.memoryVersion;
        conversation.updatedAt = now;
      }
      return cloneState(conversation);
    });
  }

  branchConversation(
    sourceConversationId: string,
    targetConversationId: string,
  ): Promise<ConversationSessionState> {
    return this.transact((state, now) => {
      const sourceDeletion = (state.deletions ?? []).find(
        (deletion) => deletion.conversationId === sourceConversationId,
      );
      if (sourceDeletion) {
        throw new SessionStateError(
          `Source conversation is ${sourceDeletion.status}: ${sourceConversationId}`,
          sourceDeletion.status === "deleting"
            ? "LOCAL_AI_CONVERSATION_DELETING"
            : "LOCAL_AI_CONVERSATION_DELETED",
        );
      }
      const targetDeletion = (state.deletions ?? []).find(
        (deletion) => deletion.conversationId === targetConversationId,
      );
      if (targetDeletion) {
        throw new SessionStateError(
          `Target conversation is ${targetDeletion.status}: ${targetConversationId}`,
          targetDeletion.status === "deleting"
            ? "LOCAL_AI_CONVERSATION_DELETING"
            : "LOCAL_AI_CONVERSATION_DELETED",
        );
      }
      if (
        state.conversations.some(
          (conversation) =>
            conversation.conversationId === targetConversationId,
        )
      ) {
        throw new SessionStateError(
          `Conversation already exists: ${targetConversationId}`,
          "LOCAL_AI_CONVERSATION_EXISTS",
        );
      }
      const source = state.conversations.find(
        (conversation) => conversation.conversationId === sourceConversationId,
      );
      const target: ConversationSessionState = {
        conversationId: targetConversationId,
        revision: 0,
        transcriptVersion: source?.transcriptVersion ?? 0,
        memoryEpoch: source?.memoryEpoch ?? 0,
        memoryVersion: source?.memoryVersion ?? 0,
        updatedAt: now,
      };
      state.conversations.push(target);
      return cloneState(target);
    });
  }

  beginConversationDeletion(
    conversationId: string,
    forgetConversationMemory: boolean,
  ): Promise<ConversationDeletionRecord> {
    return this.transact((state, now) => {
      const deletions = (state.deletions ??= []);
      state.turnHooks = (state.turnHooks ?? []).filter(
        (hook) => hook.conversationId !== conversationId,
      );
      const existing = deletions.find(
        (deletion) => deletion.conversationId === conversationId,
      );
      if (existing) {
        const mustForget =
          existing.forgetConversationMemory || forgetConversationMemory;
        if (
          existing.status === "completed" &&
          mustForget === existing.forgetConversationMemory
        ) {
          return cloneState(existing);
        }
        existing.status = "deleting";
        existing.forgetConversationMemory = mustForget;
        existing.updatedAt = now;
        delete existing.completedAt;
        delete existing.lastError;
        return cloneState(existing);
      }

      const deletion: ConversationDeletionRecord = {
        conversationId,
        operationId: randomUUID(),
        forgetConversationMemory,
        status: "deleting",
        startedAt: now,
        updatedAt: now,
      };
      deletions.push(deletion);
      return cloneState(deletion);
    });
  }

  failConversationDeletion(
    conversationId: string,
    error: string,
  ): Promise<void> {
    return this.transact((state, now) => {
      const deletion = (state.deletions ?? []).find(
        (candidate) => candidate.conversationId === conversationId,
      );
      if (!deletion || deletion.status !== "deleting") return;
      deletion.lastError = error.slice(0, 100_000);
      deletion.updatedAt = now;
    });
  }

  completeConversationDeletion(
    conversationId: string,
  ): Promise<ConversationDeletionRecord> {
    return this.transact((state, now) => {
      const deletion = (state.deletions ?? []).find(
        (candidate) => candidate.conversationId === conversationId,
      );
      if (!deletion) {
        throw new SessionStateError(
          `Conversation deletion was not prepared: ${conversationId}`,
          "LOCAL_AI_CONVERSATION_DELETION_NOT_PREPARED",
        );
      }
      if (deletion.status === "completed") return cloneState(deletion);

      state.conversations = state.conversations.filter(
        (conversation) => conversation.conversationId !== conversationId,
      );
      state.bindings = state.bindings.filter(
        (binding) => binding.conversationId !== conversationId,
      );
      state.turns = state.turns.filter(
        (turn) => turn.conversationId !== conversationId,
      );
      state.turnHooks = (state.turnHooks ?? []).filter(
        (hook) => hook.conversationId !== conversationId,
      );
      deletion.status = "completed";
      deletion.completedAt = now;
      deletion.updatedAt = now;
      delete deletion.lastError;
      const completed = cloneState(deletion);
      pruneCompletedDeletionTombstones(state);
      return completed;
    });
  }

  getConversationDeletion(
    conversationId: string,
  ): Promise<ConversationDeletionRecord | undefined> {
    return this.read((state) =>
      (state.deletions ?? []).find(
        (deletion) => deletion.conversationId === conversationId,
      ),
    );
  }

  deleteConversation(conversationId: string): Promise<boolean> {
    return this.transact((state) => {
      const originalLength = state.conversations.length;
      state.conversations = state.conversations.filter(
        (conversation) => conversation.conversationId !== conversationId,
      );
      state.bindings = state.bindings.filter(
        (binding) => binding.conversationId !== conversationId,
      );
      state.turns = state.turns.filter(
        (turn) => turn.conversationId !== conversationId,
      );
      state.turnHooks = (state.turnHooks ?? []).filter(
        (hook) => hook.conversationId !== conversationId,
      );
      return state.conversations.length !== originalLength;
    });
  }

  resetProvider(
    conversationId: string,
    providerId: ProviderSessionBinding["providerId"],
  ): Promise<void> {
    return this.transact((state) => {
      const conversation = state.conversations.find(
        (candidate) => candidate.conversationId === conversationId,
      );
      if (!conversation) return;
      state.bindings = state.bindings.filter(
        (binding) =>
          !(
            binding.conversationId === conversationId &&
            binding.providerId === providerId &&
            binding.revision === conversation.revision
          ),
      );
      state.turns = state.turns.filter(
        (turn) =>
          !(
            turn.conversationId === conversationId &&
            turn.providerId === providerId &&
            turn.revision === conversation.revision &&
            turn.status === "uncertain"
          ),
      );
      const survivingTurns = new Set(state.turns.map((turn) => turn.turnId));
      state.turnHooks = (state.turnHooks ?? []).filter((hook) =>
        survivingTurns.has(hook.turnId),
      );
    });
  }

  rotateAllForMemoryContextChange(): Promise<number> {
    return this.transact((state, now) => {
      const deletedConversationIds = new Set(
        (state.deletions ?? []).map((deletion) => deletion.conversationId),
      );
      const activeConversations = state.conversations.filter(
        (conversation) =>
          !deletedConversationIds.has(conversation.conversationId),
      );
      for (const conversation of activeConversations) {
        conversation.revision += 1;
        conversation.memoryEpoch += 1;
        conversation.memoryVersion = 0;
        conversation.updatedAt = now;
      }
      return activeConversations.length;
    });
  }

  failTurn(
    turnId: string,
    status: "failed" | "aborted" | "uncertain",
    error?: string,
  ): Promise<void> {
    return this.transact((state, now) =>
      failTurn(state, turnId, status, error, now),
    );
  }

  listReplayableTurnHooks(
    now = new Date().toISOString(),
  ): Promise<DurableTurnHookRecord[]> {
    return this.read((state) =>
      (state.turnHooks ?? []).filter(
        (hook) =>
          hook.status === "pending" &&
          hook.retryable &&
          (hook.nextAttemptAt === undefined || hook.nextAttemptAt <= now),
      ),
    );
  }

  acknowledgeTurnHook(hookId: string): Promise<boolean> {
    return this.transact((state) => {
      const hooks = (state.turnHooks ??= []);
      const index = hooks.findIndex((hook) => hook.hookId === hookId);
      if (index === -1) return false;
      hooks.splice(index, 1);
      pruneAcknowledgedTurnMetadata(state);
      return true;
    });
  }

  failTurnHook(
    hookId: string,
    error: string,
    retryable: boolean,
    pauseReason?: "configuration",
  ): Promise<void> {
    return this.transact((state, now) => {
      const hook = (state.turnHooks ?? []).find(
        (candidate) => candidate.hookId === hookId,
      );
      if (!hook || hook.status !== "pending") return;
      hook.attempts += 1;
      hook.retryable = retryable;
      if (!retryable && pauseReason) {
        hook.pauseReason = pauseReason;
      } else {
        delete hook.pauseReason;
      }
      hook.lastError = error.slice(0, 100_000);
      hook.updatedAt = now;
      if (retryable) {
        const delay = Math.min(
          TURN_HOOK_RETRY_BASE_MS * 2 ** Math.min(hook.attempts - 1, 8),
          30 * 60_000,
        );
        hook.nextAttemptAt = new Date(
          new Date(now).getTime() + delay,
        ).toISOString();
      } else {
        delete hook.nextAttemptAt;
      }
    });
  }

  resetTurnHookRetries(pauseReason?: "configuration"): Promise<number> {
    return this.transact((state, now) => {
      let reset = 0;
      for (const hook of state.turnHooks ?? []) {
        if (
          hook.status !== "pending" ||
          hook.retryable ||
          (pauseReason !== undefined && hook.pauseReason !== pauseReason)
        ) {
          continue;
        }
        hook.retryable = true;
        hook.updatedAt = now;
        delete hook.nextAttemptAt;
        delete hook.lastError;
        delete hook.pauseReason;
        reset += 1;
      }
      return reset;
    });
  }

  getConversation(
    conversationId: string,
  ): Promise<ConversationSessionState | undefined> {
    return this.read((state) => {
      if (
        (state.deletions ?? []).some(
          (deletion) => deletion.conversationId === conversationId,
        )
      ) {
        return undefined;
      }
      return state.conversations.find(
        (conversation) => conversation.conversationId === conversationId,
      );
    });
  }

  getBindings(conversationId: string): Promise<ProviderSessionBinding[]> {
    return this.read((state) => {
      if (
        (state.deletions ?? []).some(
          (deletion) => deletion.conversationId === conversationId,
        )
      ) {
        return [];
      }
      return state.bindings.filter(
        (binding) => binding.conversationId === conversationId,
      );
    });
  }

  getTurn(turnId: string): Promise<SessionTurnRecord | undefined> {
    return this.read((state) =>
      state.turns.find((turn) => turn.turnId === turnId),
    );
  }

  getTurnRuntimeState(
    conversationId: string,
    turnId: string,
  ): Promise<LocalAITurnRuntimeState | undefined> {
    return this.read((state) => {
      if (
        (state.deletions ?? []).some(
          (deletion) => deletion.conversationId === conversationId,
        )
      ) {
        return undefined;
      }
      const turn = state.turns.find(
        (candidate) =>
          candidate.conversationId === conversationId &&
          candidate.turnId === turnId,
      );
      if (!turn) return undefined;
      return {
        conversationId: turn.conversationId,
        turnId: turn.turnId,
        requestId: turn.requestId,
        providerId: turn.providerId,
        modelId: turn.modelId,
        revision: turn.revision,
        status: turn.status,
        startedAt: turn.startedAt,
        completedAt: turn.completedAt,
        finishReason: turn.finishReason,
        assistantText: turn.assistantText,
        assistantTextTruncated: turn.assistantTextTruncated,
        error: turn.error,
        rendererPersistedAt: turn.rendererPersistedAt,
      };
    });
  }

  acknowledgeTurnPersistence(
    conversationId: string,
    turnId: string,
  ): Promise<boolean> {
    return this.transact((state, now) => {
      const turn = state.turns.find(
        (candidate) =>
          candidate.conversationId === conversationId &&
          candidate.turnId === turnId,
      );
      if (!turn) return false;
      if (turn.status === "pending") {
        throw new SessionStateError(
          `Turn has not reached a terminal state: ${turnId}`,
          "LOCAL_AI_TURN_NOT_TERMINAL",
        );
      }
      if (!turn.rendererPersistedAt) {
        turn.rendererPersistedAt = now;
        delete turn.assistantText;
        delete turn.assistantTextTruncated;
      }
      pruneAcknowledgedTurnMetadata(state);
      return true;
    });
  }

  snapshot(): Promise<LocalAiRuntimeState> {
    return this.read((state) => state);
  }
}

export class JsonSessionStateRepository extends SerializedSessionStateRepository {
  private state?: LocalAiRuntimeState;

  constructor(private readonly options: JsonSessionStateRepositoryOptions) {
    super(options.clock ?? (() => new Date()));
  }

  protected async readState(): Promise<LocalAiRuntimeState> {
    if (this.state) return this.state;

    let state: LocalAiRuntimeState;
    let migrated = false;
    try {
      const parsed: unknown = JSON.parse(
        await readFile(this.options.path, "utf8"),
      );
      const decoded = migrateLegacyState(parsed);
      migrated = decoded !== parsed;
      assertState(decoded);
      state = decoded;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        state = emptyState();
      } else {
        throw error;
      }
    }

    const interruptedAt = (
      this.options.clock ?? (() => new Date())
    )().toISOString();
    let recovered = false;
    for (const turn of state.turns) {
      if (turn.status !== "pending") continue;
      turn.status = turn.providerStartedAt ? "uncertain" : "interrupted";
      turn.completedAt = interruptedAt;
      turn.finishReason = "error";
      turn.error = "Electron exited before the turn committed.";
      if (turn.providerStartedAt) {
        invalidateBinding(
          state,
          turn.conversationId,
          turn.providerId,
          turn.revision,
          interruptedAt,
          turn.actorId,
        );
      }
      makeTurnHookPending(state, turn.turnId, "failed", interruptedAt);
      recovered = true;
    }
    if (migrated || recovered) await this.persist(state);
    this.state = state;
    return state;
  }

  protected async writeState(state: LocalAiRuntimeState): Promise<void> {
    await this.persist(state);
    this.state = state;
  }

  private async persist(state: LocalAiRuntimeState): Promise<void> {
    const directory = dirname(this.options.path);
    const temporaryPath = `${this.options.path}.${process.pid}.${randomUUID()}.tmp`;
    await mkdir(directory, { recursive: true });
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await rename(temporaryPath, this.options.path);
      await this.syncParentDirectory();
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  private async syncParentDirectory(): Promise<void> {
    let directory: Awaited<ReturnType<typeof open>> | undefined;
    try {
      directory = await open(dirname(this.options.path), "r");
      await directory.sync();
    } catch (error) {
      const code =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined;
      if (!["EINVAL", "EPERM", "EISDIR"].includes(code ?? "")) {
        throw error;
      }
    } finally {
      await directory?.close().catch(() => undefined);
    }
  }
}

export class InMemorySessionStateRepository extends SerializedSessionStateRepository {
  private state: LocalAiRuntimeState;

  constructor(options: InMemorySessionStateRepositoryOptions = {}) {
    super(options.clock ?? (() => new Date()));
    this.state = cloneState(options.initialState ?? emptyState());
    assertState(this.state);
    const interruptedAt = (options.clock ?? (() => new Date()))().toISOString();
    for (const turn of this.state.turns) {
      if (turn.status !== "pending") continue;
      turn.status = turn.providerStartedAt ? "uncertain" : "interrupted";
      turn.completedAt = interruptedAt;
      turn.finishReason = "error";
      turn.error = "Electron exited before the turn committed.";
      if (turn.providerStartedAt) {
        invalidateBinding(
          this.state,
          turn.conversationId,
          turn.providerId,
          turn.revision,
          interruptedAt,
          turn.actorId,
        );
      }
    }
  }

  protected async readState(): Promise<LocalAiRuntimeState> {
    return this.state;
  }

  protected async writeState(state: LocalAiRuntimeState): Promise<void> {
    this.state = state;
  }
}

export function defaultSessionStatePath(): string {
  const userData = app?.getPath?.("userData") ?? join(homedir(), ".convera");
  return join(userData, "local-ai-runtime-state.json");
}
