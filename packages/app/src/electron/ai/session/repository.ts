import { app } from "electron";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  LOCAL_AI_RUNTIME_STATE_SCHEMA_VERSION,
  SessionStateError,
  type BeginSessionTurnInput,
  type CompleteSessionTurnInput,
  type ConversationSessionState,
  type LocalAiRuntimeStateV1,
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
  initialState?: LocalAiRuntimeStateV1;
}

function emptyState(): LocalAiRuntimeStateV1 {
  return {
    schemaVersion: LOCAL_AI_RUNTIME_STATE_SCHEMA_VERSION,
    conversations: [],
    bindings: [],
    turns: [],
  };
}

function cloneState<T>(value: T): T {
  return structuredClone(value);
}

function bindingMatches(
  binding: ProviderSessionBinding,
  conversationId: string,
  providerId: string,
  revision: number,
): boolean {
  return (
    binding.conversationId === conversationId &&
    binding.providerId === providerId &&
    binding.revision === revision
  );
}

const identifierSchema = z.string().trim().min(1).max(4_096);
const timestampSchema = z.string().datetime();
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
    memoryEpoch: z.number().int().min(0),
    memoryVersion: z.number().int().min(0),
    updatedAt: timestampSchema,
  })
  .strict();
const bindingSchema = z
  .object({
    conversationId: identifierSchema,
    providerId: z.enum(["codex-cli", "claude-code"]),
    revision: z.number().int().min(0),
    nativeSessionId: identifierSchema,
    cwd: z.string().min(1).max(32_768),
    modelId: z.string().min(1).max(4_096).optional(),
    stale: z.boolean(),
    memoryCursors: z.record(identifierSchema, memoryCursorSchema).optional(),
    updatedAt: timestampSchema,
  })
  .strict();
const turnSchema = z
  .object({
    turnId: identifierSchema,
    requestId: identifierSchema,
    conversationId: identifierSchema,
    providerId: z.enum(["codex-cli", "claude-code"]),
    revision: z.number().int().min(0),
    operation: z.enum(["append", "bootstrap", "rebase"]),
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
    error: z.string().max(100_000).optional(),
  })
  .strict();
const runtimeStateSchema = z
  .object({
    schemaVersion: z.literal(LOCAL_AI_RUNTIME_STATE_SCHEMA_VERSION),
    conversations: z.array(conversationSchema).max(100_000),
    bindings: z.array(bindingSchema).max(200_000),
    turns: z.array(turnSchema).max(500_000),
  })
  .strict();

function assertState(value: unknown): asserts value is LocalAiRuntimeStateV1 {
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
  const uniqueBindings = new Set(
    state.bindings.map(
      (binding) =>
        `${binding.conversationId}\0${binding.providerId}\0${binding.revision}`,
    ),
  );
  const structurallyConsistent =
    conversations.size === state.conversations.length &&
    uniqueTurnIds.size === state.turns.length &&
    uniqueBindings.size === state.bindings.length &&
    state.bindings.every((binding) => {
      const conversation = conversations.get(binding.conversationId);
      return conversation && binding.revision <= conversation.revision;
    }) &&
    state.turns.every((turn) => {
      const conversation = conversations.get(turn.conversationId);
      return conversation && turn.revision <= conversation.revision;
    });
  if (!structurallyConsistent) {
    throw new SessionStateError(
      "Local AI runtime state contains inconsistent conversation references.",
      "LOCAL_AI_SESSION_STATE_INVALID",
    );
  }
}

function beginTurn(
  state: LocalAiRuntimeStateV1,
  input: BeginSessionTurnInput,
  now: string,
): PreparedSessionTurn {
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
    ),
  );
  const currentRevisionIsUncertain = state.turns.some(
    (turn) =>
      turn.conversationId === input.conversationId &&
      turn.providerId === input.providerId &&
      turn.revision === conversation.revision &&
      turn.status === "uncertain",
  );
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
    ),
  );
  const hasUncertainTurn = state.turns.some(
    (turn) =>
      turn.conversationId === input.conversationId &&
      turn.providerId === input.providerId &&
      turn.revision === conversation.revision &&
      turn.status === "uncertain",
  );
  if (
    input.operation === "append" &&
    (binding?.stale === true || hasUncertainTurn)
  ) {
    throw new SessionStateError(
      "The provider session may contain an uncommitted turn. Bootstrap or rebase before continuing.",
      "LOCAL_AI_SESSION_REBASE_REQUIRED",
    );
  }

  const turn: SessionTurnRecord = {
    turnId: input.turnId,
    requestId: input.requestId,
    conversationId: input.conversationId,
    providerId: input.providerId,
    revision: conversation.revision,
    operation: input.operation,
    status: "pending",
    startedAt: now,
  };
  state.turns.push(turn);

  return cloneState({ turn, conversation, binding });
}

function invalidateBinding(
  state: LocalAiRuntimeStateV1,
  conversationId: string,
  providerId: string,
  revision: number,
  now: string,
): void {
  const binding = state.bindings.find((candidate) =>
    bindingMatches(candidate, conversationId, providerId, revision),
  );
  if (!binding) return;
  binding.stale = true;
  binding.updatedAt = now;
}

function completeTurn(
  state: LocalAiRuntimeStateV1,
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
    ),
  );
  const existingBinding =
    bindingIndex === -1 ? undefined : state.bindings[bindingIndex];
  const binding: ProviderSessionBinding = {
    conversationId: turn.conversationId,
    providerId: turn.providerId,
    revision: turn.revision,
    nativeSessionId,
    cwd: input.cwd,
    modelId: input.modelId,
    stale: false,
    memoryCursors: cloneState(
      input.memoryCursors ?? existingBinding?.memoryCursors ?? {},
    ),
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

  const conversation = state.conversations.find(
    (candidate) => candidate.conversationId === turn.conversationId,
  );
  if (conversation) conversation.updatedAt = now;
  return cloneState(binding);
}

function failTurn(
  state: LocalAiRuntimeStateV1,
  turnId: string,
  status: "failed" | "aborted" | "uncertain",
  error: string | undefined,
  now: string,
): void {
  const turn = state.turns.find((candidate) => candidate.turnId === turnId);
  if (!turn || turn.status !== "pending") return;
  turn.status = status;
  turn.completedAt = now;
  if (error) turn.error = error;
  if (status === "uncertain") {
    invalidateBinding(
      state,
      turn.conversationId,
      turn.providerId,
      turn.revision,
      now,
    );
  }
}

abstract class SerializedSessionStateRepository
  implements SessionStateRepository
{
  private queue: Promise<void> = Promise.resolve();

  protected constructor(private readonly clock: Clock) {}

  protected abstract readState(): Promise<LocalAiRuntimeStateV1>;
  protected abstract writeState(state: LocalAiRuntimeStateV1): Promise<void>;

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private transact<T>(
    mutate: (state: LocalAiRuntimeStateV1, now: string) => T,
  ): Promise<T> {
    return this.serialize(async () => {
      const state = await this.readState();
      const next = cloneState(state);
      const result = mutate(next, this.clock().toISOString());
      await this.writeState(next);
      return result;
    });
  }

  private read<T>(select: (state: LocalAiRuntimeStateV1) => T): Promise<T> {
    return this.serialize(async () =>
      select(cloneState(await this.readState())),
    );
  }

  beginTurn(input: BeginSessionTurnInput): Promise<PreparedSessionTurn> {
    return this.transact((state, now) => beginTurn(state, input, now));
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
  ): Promise<void> {
    return this.transact((state, now) =>
      invalidateBinding(state, conversationId, providerId, revision, now),
    );
  }

  setConversationMemoryState(
    conversationId: string,
    memoryState: { memoryVersion: number; memoryEpoch: number },
  ): Promise<ConversationSessionState> {
    return this.transact((state, now) => {
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
        memoryEpoch: source?.memoryEpoch ?? 0,
        memoryVersion: source?.memoryVersion ?? 0,
        updatedAt: now,
      };
      state.conversations.push(target);
      return cloneState(target);
    });
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
          !bindingMatches(
            binding,
            conversationId,
            providerId,
            conversation.revision,
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
    });
  }

  rotateAllForMemoryContextChange(): Promise<number> {
    return this.transact((state, now) => {
      for (const conversation of state.conversations) {
        conversation.revision += 1;
        conversation.memoryEpoch += 1;
        conversation.memoryVersion = 0;
        conversation.updatedAt = now;
      }
      return state.conversations.length;
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

  getConversation(
    conversationId: string,
  ): Promise<ConversationSessionState | undefined> {
    return this.read((state) =>
      state.conversations.find(
        (conversation) => conversation.conversationId === conversationId,
      ),
    );
  }

  getBindings(conversationId: string): Promise<ProviderSessionBinding[]> {
    return this.read((state) =>
      state.bindings.filter(
        (binding) => binding.conversationId === conversationId,
      ),
    );
  }

  getTurn(turnId: string): Promise<SessionTurnRecord | undefined> {
    return this.read((state) =>
      state.turns.find((turn) => turn.turnId === turnId),
    );
  }

  snapshot(): Promise<LocalAiRuntimeStateV1> {
    return this.read((state) => state);
  }
}

export class JsonSessionStateRepository extends SerializedSessionStateRepository {
  private state?: LocalAiRuntimeStateV1;

  constructor(private readonly options: JsonSessionStateRepositoryOptions) {
    super(options.clock ?? (() => new Date()));
  }

  protected async readState(): Promise<LocalAiRuntimeStateV1> {
    if (this.state) return this.state;

    let state: LocalAiRuntimeStateV1;
    try {
      const parsed: unknown = JSON.parse(
        await readFile(this.options.path, "utf8"),
      );
      assertState(parsed);
      state = parsed;
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
      turn.error = "Electron exited before the turn committed.";
      if (turn.providerStartedAt) {
        invalidateBinding(
          state,
          turn.conversationId,
          turn.providerId,
          turn.revision,
          interruptedAt,
        );
      }
      recovered = true;
    }
    if (recovered) await this.persist(state);
    this.state = state;
    return state;
  }

  protected async writeState(state: LocalAiRuntimeStateV1): Promise<void> {
    await this.persist(state);
    this.state = state;
  }

  private async persist(state: LocalAiRuntimeStateV1): Promise<void> {
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
  private state: LocalAiRuntimeStateV1;

  constructor(options: InMemorySessionStateRepositoryOptions = {}) {
    super(options.clock ?? (() => new Date()));
    this.state = cloneState(options.initialState ?? emptyState());
    assertState(this.state);
    const interruptedAt = (options.clock ?? (() => new Date()))().toISOString();
    for (const turn of this.state.turns) {
      if (turn.status !== "pending") continue;
      turn.status = turn.providerStartedAt ? "uncertain" : "interrupted";
      turn.completedAt = interruptedAt;
      turn.error = "Electron exited before the turn committed.";
      if (turn.providerStartedAt) {
        invalidateBinding(
          this.state,
          turn.conversationId,
          turn.providerId,
          turn.revision,
          interruptedAt,
        );
      }
    }
  }

  protected async readState(): Promise<LocalAiRuntimeStateV1> {
    return this.state;
  }

  protected async writeState(state: LocalAiRuntimeStateV1): Promise<void> {
    this.state = state;
  }
}

export function defaultSessionStatePath(): string {
  const userData = app?.getPath?.("userData") ?? join(homedir(), ".convera");
  return join(userData, "local-ai-runtime-state.json");
}
