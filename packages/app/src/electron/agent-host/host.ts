import { randomUUID } from "node:crypto";
import type {
  AgentHostCollaboration,
  AgentHostDispatch,
  AgentHostEvent,
  AgentHostJob,
  AgentHostStructuredTaskBrief,
  AgentHostTarget,
  AgentHostTaskSummary,
} from "@/shared/types/agent-host";
import type { AgentHostJobRepository } from "./repository";

export interface AgentHostExecutor {
  execute(
    job: AgentHostJob,
    emit: (event: AgentHostEvent) => void,
  ): Promise<void>;
  cancel?(job: AgentHostJob): Promise<boolean> | boolean;
}

export interface AgentHostOptions {
  repository: AgentHostJobRepository;
  executor: AgentHostExecutor;
  maxConcurrency?: number;
  now?: () => Date;
  createId?: () => string;
  startPaused?: boolean;
}

export interface AgentHostDelegationRequest {
  sourceJobId: string;
  sourceTaskId: string;
  callerMemberId: string;
  idempotencyKey: string;
  inputHash: string;
  delegates: Array<{
    target: AgentHostTarget;
    brief: AgentHostStructuredTaskBrief;
    maxOutputTokens?: number;
  }>;
  ttlSeconds?: number;
}

export interface AgentHostHandoffRequest {
  sourceJobId: string;
  sourceTaskId: string;
  callerMemberId: string;
  idempotencyKey: string;
  inputHash: string;
  target: AgentHostTarget;
  brief: AgentHostStructuredTaskBrief;
  ttlSeconds?: number;
}

export interface AgentHostDelegationJoin {
  strategy: "all" | "any" | "quorum";
  quorum?: number;
  cancelRemainingOnSatisfied: boolean;
  timeoutMs: number;
}

export interface AgentHostDelegationOutcome {
  operationId: string;
  joinStatus: "satisfied" | "partial" | "expired";
  jobs: AgentHostJob[];
}

type Listener = (event: AgentHostEvent) => void;

const TERMINAL = new Set<AgentHostJob["status"]>([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,256}$/;
const MAX_CONTEXT_MESSAGES = 500;
/**
 * Deliberately a second copy of the renderer's `MAX_CHAIN_HOPS` rather than an
 * import: this is the trust boundary, and a compromised renderer must not be
 * able to raise its own ceiling. Keep it in step when that one is retuned —
 * lower here silently caps collaboration the renderer thinks it allowed.
 */
const MAX_DISPATCH_HOPS = 20;
const MAX_CONTROL_INSTRUCTIONS = 100;
const MAX_CONTROL_INSTRUCTION_LENGTH = 4_000;
const MAX_STRUCTURED_TASK_DEPTH = 4;

/**
 * One colleague works on one thing at a time, wherever the work came from.
 *
 * Keyed on the member alone, not the room: a person called into two rooms at
 * once answers one and then the other, and their memory of the first is what
 * they carry into the second. Keying by conversation ran the same colleague
 * twice in parallel, which is also what let two rooms hold two unrelated
 * provider sessions for one agent.
 *
 * Different colleagues in one room still run concurrently — that is what an
 * open floor is.
 */
function actorKey(job: Pick<AgentHostJob, "agentMemberId">) {
  return job.agentMemberId;
}

function validateDispatch(dispatch: AgentHostDispatch): void {
  if (
    !IDENTIFIER.test(dispatch.channelId) ||
    !["channel", "dm"].includes(dispatch.channelKind) ||
    !IDENTIFIER.test(dispatch.conversationId) ||
    !IDENTIFIER.test(dispatch.triggerMessageId) ||
    !Array.isArray(dispatch.contextMessageIds) ||
    dispatch.contextMessageIds.length === 0 ||
    dispatch.contextMessageIds.length > MAX_CONTEXT_MESSAGES ||
    !dispatch.contextMessageIds.includes(dispatch.triggerMessageId) ||
    !dispatch.contextMessageIds.every((id) => IDENTIFIER.test(id)) ||
    !["open-floor", "direct"].includes(dispatch.mode) ||
    !Array.isArray(dispatch.offeredAgentMemberIds) ||
    dispatch.offeredAgentMemberIds.length > 16 ||
    !dispatch.offeredAgentMemberIds.every(
      (id) => IDENTIFIER.test(id) && id.startsWith("agent:"),
    ) ||
    !Array.isArray(dispatch.targets) ||
    dispatch.targets.length === 0 ||
    dispatch.targets.length > 16 ||
    // Checked against the offer list, not `chain.invoked`. They used to agree,
    // but an open floor now offers the room without booking everyone present
    // against the once-per-chain rule — requiring both would reject every
    // open-floor dispatch. `offeredAgentMemberIds` is the real whitelist: it
    // is exactly who routing decided to invite for this message.
    !dispatch.targets.every(
      (target) =>
        IDENTIFIER.test(target.agentId) &&
        IDENTIFIER.test(target.memberId) &&
        target.memberId.startsWith("agent:") &&
        dispatch.offeredAgentMemberIds.includes(target.memberId),
    ) ||
    !Number.isInteger(dispatch.chain.hops) ||
    dispatch.chain.hops < 0 ||
    dispatch.chain.hops > MAX_DISPATCH_HOPS ||
    !Array.isArray(dispatch.chain.invoked) ||
    dispatch.chain.invoked.length > 16 ||
    !dispatch.chain.invoked.every((id) => IDENTIFIER.test(id))
  ) {
    throw new Error("Invalid Agent Host dispatch.");
  }
}

function byCreation(left: AgentHostJob, right: AgentHostJob): number {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function currentJob(jobs: AgentHostJob[]): AgentHostJob {
  const replacedJobIds = new Set(
    jobs.flatMap((job) => (job.parentJobId ? [job.parentJobId] : [])),
  );
  return (
    jobs.find((job) => !replacedJobIds.has(job.id)) ??
    ([...jobs].sort(byCreation).at(-1) as AgentHostJob)
  );
}

export function summarizeAgentHostTasks(
  jobs: AgentHostJob[],
  agentMemberId?: string,
): AgentHostTaskSummary[] {
  const grouped = new Map<string, AgentHostJob[]>();
  for (const job of jobs) {
    const runs = grouped.get(job.taskId);
    if (runs) runs.push(job);
    else grouped.set(job.taskId, [job]);
  }
  return [...grouped.entries()]
    .map(([taskId, runs]) => {
      const current = currentJob(runs);
      const first = [...runs].sort(byCreation)[0];
      return {
        id: taskId,
        channelId: current.channelId,
        channelKind: current.channelKind,
        conversationId: current.conversationId,
        triggerMessageId: current.triggerMessageId,
        agentId: current.agentId,
        agentMemberId: current.agentMemberId,
        currentJobId: current.id,
        parentTaskId: current.parentTaskId,
        collaboration: current.collaboration
          ? structuredClone(current.collaboration)
          : undefined,
        outputMessageIds: current.outputMessageIds
          ? [...current.outputMessageIds]
          : undefined,
        status: current.status,
        runCount: runs.length,
        controlInstructions: [...current.controlInstructions],
        createdAt: first.createdAt,
        updatedAt: current.updatedAt,
        startedAt: current.startedAt,
        completedAt: current.completedAt,
        error: current.error,
      };
    })
    .filter((task) => !agentMemberId || task.agentMemberId === agentMemberId)
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.id.localeCompare(left.id),
    );
}

export class AgentHost {
  private readonly repository: AgentHostJobRepository;
  private readonly executor: AgentHostExecutor;
  private readonly maxConcurrency: number;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly jobs = new Map<string, AgentHostJob>();
  private readonly listeners = new Set<Listener>();
  private readonly running = new Set<string>();
  private readonly pausing = new Set<string>();
  private readonly activeActors = new Set<string>();
  private readonly taskControlQueues = new Map<string, Promise<void>>();
  private ready: Promise<void>;
  private accepting = true;
  private drainQueued = false;
  private paused: boolean;

  constructor(options: AgentHostOptions) {
    this.repository = options.repository;
    this.executor = options.executor;
    this.maxConcurrency = Math.max(1, options.maxConcurrency ?? 3);
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.paused = options.startPaused ?? false;
    this.ready = this.hydrate();
  }

  private async hydrate(): Promise<void> {
    const jobs = await this.repository.list();
    for (const stored of jobs) {
      const job = structuredClone(stored);
      if (job.status === "running") {
        job.status = "interrupted";
        job.error =
          "Agent work was interrupted by an application restart and was not replayed to avoid duplicating tool actions.";
        job.completedAt = this.now().toISOString();
        job.updatedAt = job.completedAt;
        await this.repository.put(job);
      }
      this.jobs.set(job.id, job);
    }
    this.scheduleDrain();
  }

  async initialize(): Promise<void> {
    await this.ready;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.paused = false;
    this.scheduleDrain();
  }

  async listJobs(): Promise<AgentHostJob[]> {
    await this.ready;
    return [...this.jobs.values()]
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      )
      .map((job) => structuredClone(job));
  }

  async listTasks(agentMemberId?: string): Promise<AgentHostTaskSummary[]> {
    await this.ready;
    return summarizeAgentHostTasks([...this.jobs.values()], agentMemberId);
  }

  async enqueue(dispatch: AgentHostDispatch): Promise<AgentHostJob[]> {
    await this.ready;
    if (!this.accepting) throw new Error("Agent Host is stopping.");
    validateDispatch(dispatch);
    const now = this.now().toISOString();
    const created: AgentHostJob[] = [];
    const targets = dispatch.targets.filter(
      (target, index, all) =>
        all.findIndex((candidate) => candidate.memberId === target.memberId) ===
        index,
    );
    for (const target of targets) {
      const duplicate = [...this.jobs.values()].find(
        (job) =>
          job.triggerMessageId === dispatch.triggerMessageId &&
          job.agentMemberId === target.memberId &&
          job.status !== "cancelled" &&
          job.status !== "failed" &&
          job.status !== "interrupted",
      );
      if (duplicate) {
        created.push(structuredClone(duplicate));
        continue;
      }
      const id = this.createId();
      const job: AgentHostJob = {
        id,
        taskId: id,
        channelId: dispatch.channelId,
        channelKind: dispatch.channelKind,
        conversationId: dispatch.conversationId,
        triggerMessageId: dispatch.triggerMessageId,
        contextMessageIds: [...dispatch.contextMessageIds],
        mode: dispatch.mode,
        offeredAgentMemberIds: [...dispatch.offeredAgentMemberIds],
        agentId: target.agentId,
        agentMemberId: target.memberId,
        chain: structuredClone(dispatch.chain),
        controlInstructions: [],
        status: "queued",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.jobs.set(job.id, job);
      await this.repository.put(job);
      this.emit({ type: "job", job });
      created.push(structuredClone(job));
    }
    this.scheduleDrain();
    return created;
  }

  delegateTask(request: AgentHostDelegationRequest): Promise<{
    operationId: string;
    jobs: AgentHostJob[];
  }> {
    return this.serializeTaskControl(request.sourceTaskId, () =>
      this.delegateTaskNow(request),
    );
  }

  private async delegateTaskNow(request: AgentHostDelegationRequest): Promise<{
    operationId: string;
    jobs: AgentHostJob[];
  }> {
    await this.ready;
    const replay = this.findCollaboration(
      "delegation",
      request.sourceJobId,
      request.idempotencyKey,
      request.inputHash,
    );
    if (replay.length > 0) {
      return {
        operationId: replay[0].collaboration?.operationId as string,
        jobs: replay.map((job) => structuredClone(job)),
      };
    }
    const source = this.structuredTaskSource(request);
    const sourcePath = source.collaboration?.path ?? [source.agentMemberId];
    const depth = (source.collaboration?.depth ?? 0) + 1;
    if (depth > MAX_STRUCTURED_TASK_DEPTH) {
      throw new Error(
        `Structured task depth cannot exceed ${MAX_STRUCTURED_TASK_DEPTH}.`,
      );
    }
    for (const { target } of request.delegates) {
      if (sourcePath.includes(target.memberId)) {
        throw new Error(
          `Delegating to ${target.memberId} would repeat an agent already in this task path.`,
        );
      }
    }

    const operationId = this.createId();
    const now = this.now().toISOString();
    const expiresAt = request.ttlSeconds
      ? new Date(
          new Date(now).getTime() + request.ttlSeconds * 1_000,
        ).toISOString()
      : undefined;
    const offeredAgentMemberIds = request.delegates.map(
      ({ target }) => target.memberId,
    );
    const jobs: AgentHostJob[] = [];
    for (const delegate of request.delegates) {
      const id = this.createId();
      const collaboration: AgentHostCollaboration = {
        kind: "delegation",
        operationId,
        idempotencyKey: request.idempotencyKey,
        inputHash: request.inputHash,
        sourceTaskId: source.taskId,
        sourceJobId: source.id,
        fromMemberId: source.agentMemberId,
        depth,
        path: [...sourcePath, delegate.target.memberId],
        brief: structuredClone(delegate.brief),
        expiresAt,
      };
      const job: AgentHostJob = {
        id,
        taskId: id,
        parentTaskId: source.taskId,
        channelId: source.channelId,
        channelKind: source.channelKind,
        conversationId: source.conversationId,
        triggerMessageId: source.triggerMessageId,
        contextMessageIds: [...source.contextMessageIds],
        mode: "direct",
        offeredAgentMemberIds: [...offeredAgentMemberIds],
        agentId: delegate.target.agentId,
        agentMemberId: delegate.target.memberId,
        chain: {
          hops: source.chain.hops,
          invoked: source.chain.invoked.includes(delegate.target.memberId)
            ? [...source.chain.invoked]
            : [...source.chain.invoked, delegate.target.memberId],
        },
        controlInstructions: [],
        collaboration,
        outputMessageIds: [],
        maxOutputTokens: delegate.maxOutputTokens,
        status: "queued",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.jobs.set(id, job);
      await this.repository.put(job);
      this.emit({ type: "job", job });
      jobs.push(structuredClone(job));
    }
    this.scheduleDrain();
    return { operationId, jobs };
  }

  handoffTask(request: AgentHostHandoffRequest): Promise<{
    operationId: string;
    job: AgentHostJob;
  }> {
    return this.serializeTaskControl(request.sourceTaskId, () =>
      this.handoffTaskNow(request),
    );
  }

  private async handoffTaskNow(request: AgentHostHandoffRequest): Promise<{
    operationId: string;
    job: AgentHostJob;
  }> {
    await this.ready;
    const replay = this.findCollaboration(
      "handoff",
      request.sourceJobId,
      request.idempotencyKey,
      request.inputHash,
    );
    if (replay.length > 0) {
      return {
        operationId: replay[0].collaboration?.operationId as string,
        job: structuredClone(replay[0]),
      };
    }
    const source = this.structuredTaskSource(request);
    const sourcePath = source.collaboration?.path ?? [source.agentMemberId];
    const depth = (source.collaboration?.depth ?? 0) + 1;
    if (depth > MAX_STRUCTURED_TASK_DEPTH) {
      throw new Error(
        `Structured task depth cannot exceed ${MAX_STRUCTURED_TASK_DEPTH}.`,
      );
    }
    if (sourcePath.includes(request.target.memberId)) {
      throw new Error(
        `Handing off to ${request.target.memberId} would repeat an agent already in this task path.`,
      );
    }

    const operationId = this.createId();
    const id = this.createId();
    const now = this.now().toISOString();
    const expiresAt = request.ttlSeconds
      ? new Date(
          new Date(now).getTime() + request.ttlSeconds * 1_000,
        ).toISOString()
      : undefined;
    const collaboration: AgentHostCollaboration = {
      kind: "handoff",
      operationId,
      idempotencyKey: request.idempotencyKey,
      inputHash: request.inputHash,
      sourceTaskId: source.taskId,
      sourceJobId: source.id,
      fromMemberId: source.agentMemberId,
      depth,
      path: [...sourcePath, request.target.memberId],
      brief: structuredClone(request.brief),
      expiresAt,
    };
    const successor: AgentHostJob = {
      id,
      taskId: source.taskId,
      parentTaskId: source.parentTaskId,
      parentJobId: source.id,
      channelId: source.channelId,
      channelKind: source.channelKind,
      conversationId: source.conversationId,
      triggerMessageId: source.triggerMessageId,
      contextMessageIds: [...source.contextMessageIds],
      mode: "direct",
      offeredAgentMemberIds: [request.target.memberId],
      agentId: request.target.agentId,
      agentMemberId: request.target.memberId,
      chain: {
        hops: source.chain.hops,
        invoked: source.chain.invoked.includes(request.target.memberId)
          ? [...source.chain.invoked]
          : [...source.chain.invoked, request.target.memberId],
      },
      controlInstructions: [...source.controlInstructions],
      collaboration,
      outputMessageIds: [],
      maxOutputTokens: source.maxOutputTokens,
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, successor);
    await this.repository.put(successor);
    this.emit({ type: "job", job: successor });
    this.scheduleDrain();
    return { operationId, job: structuredClone(successor) };
  }

  async recordOutput(jobId: string, messageId: string): Promise<boolean> {
    await this.ready;
    if (!IDENTIFIER.test(messageId)) return false;
    const job = this.jobs.get(jobId);
    if (!job || TERMINAL.has(job.status)) return false;
    const outputMessageIds = job.outputMessageIds ?? [];
    if (outputMessageIds.includes(messageId)) return true;
    job.outputMessageIds = [...outputMessageIds, messageId];
    job.updatedAt = this.now().toISOString();
    await this.repository.put(job);
    this.emit({ type: "job", job });
    return true;
  }

  async waitForDelegation(
    operationId: string,
    join: AgentHostDelegationJoin,
  ): Promise<AgentHostDelegationOutcome> {
    await this.ready;
    const jobsForOperation = () =>
      this.currentCollaborationJobs(
        [...this.jobs.values()].filter(
          (job) =>
            job.collaboration?.kind === "delegation" &&
            job.collaboration.operationId === operationId,
        ),
      );
    if (jobsForOperation().length === 0) {
      throw new Error(`Delegation ${operationId} was not found.`);
    }
    const needed =
      join.strategy === "all"
        ? jobsForOperation().length
        : join.strategy === "any"
          ? 1
          : (join.quorum ?? 1);

    const decision = (): "satisfied" | "partial" | undefined => {
      const jobs = jobsForOperation();
      const completed = jobs.filter((job) => job.status === "completed").length;
      const pending = jobs.filter((job) => !TERMINAL.has(job.status)).length;
      if (completed >= needed) return "satisfied";
      if (completed + pending < needed) return "partial";
      return undefined;
    };

    let dispose: () => void = () => undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const joinStatus = await new Promise<"satisfied" | "partial" | "expired">(
      (resolve) => {
        let settled = false;
        const finish = (status: "satisfied" | "partial" | "expired") => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          dispose();
          resolve(status);
        };
        const check = () => {
          const status = decision();
          if (status) finish(status);
        };
        dispose = this.subscribe((event) => {
          if (
            event.type === "job" &&
            event.job.collaboration?.operationId === operationId
          ) {
            check();
          }
        });
        timer = setTimeout(() => finish("expired"), join.timeoutMs);
        check();
      },
    );

    const shouldCancel =
      joinStatus !== "satisfied" || join.cancelRemainingOnSatisfied;
    if (shouldCancel) {
      await Promise.all(
        jobsForOperation()
          .filter((job) => !TERMINAL.has(job.status))
          .map((job) => this.cancel(job.id)),
      );
    }
    return {
      operationId,
      joinStatus,
      jobs: jobsForOperation().map((job) => structuredClone(job)),
    };
  }

  async cancel(jobId: string): Promise<boolean> {
    await this.ready;
    const job = this.jobs.get(jobId);
    if (!job || TERMINAL.has(job.status)) return false;
    if (job.status === "running") {
      const cancelled = await this.executor.cancel?.(structuredClone(job));
      if (cancelled === false) return false;
    }
    await this.finish(job, "cancelled", "Cancelled by the user.");
    return true;
  }

  pauseTask(taskId: string, agentMemberId?: string): Promise<boolean> {
    return this.serializeTaskControl(taskId, () =>
      this.pauseTaskNow(taskId, agentMemberId),
    );
  }

  private async pauseTaskNow(
    taskId: string,
    agentMemberId?: string,
  ): Promise<boolean> {
    await this.ready;
    const job = this.taskCurrentJob(taskId, agentMemberId);
    if (!job || TERMINAL.has(job.status) || job.status === "paused") {
      return false;
    }
    if (job.status === "running") {
      this.pausing.add(job.id);
      const cancelled = await this.executor.cancel?.(structuredClone(job));
      if (cancelled === false) {
        this.pausing.delete(job.id);
        return false;
      }
    }
    job.status = "paused";
    job.error = undefined;
    job.completedAt = undefined;
    job.updatedAt = this.now().toISOString();
    await this.repository.put(job);
    this.emit({ type: "job", job });
    this.pausing.delete(job.id);
    return true;
  }

  resumeTask(taskId: string, agentMemberId?: string): Promise<boolean> {
    return this.serializeTaskControl(taskId, () =>
      this.resumeTaskNow(taskId, agentMemberId),
    );
  }

  private async resumeTaskNow(
    taskId: string,
    agentMemberId?: string,
  ): Promise<boolean> {
    await this.ready;
    const job = this.taskCurrentJob(taskId, agentMemberId);
    if (!job || job.status !== "paused") return false;
    job.status = "queued";
    job.error = undefined;
    job.completedAt = undefined;
    job.updatedAt = this.now().toISOString();
    await this.repository.put(job);
    this.emit({ type: "job", job });
    this.scheduleDrain();
    return true;
  }

  cancelTask(taskId: string, agentMemberId?: string): Promise<boolean> {
    return this.serializeTaskControl(taskId, () =>
      this.cancelTaskNow(taskId, agentMemberId),
    );
  }

  private async cancelTaskNow(
    taskId: string,
    agentMemberId?: string,
  ): Promise<boolean> {
    await this.ready;
    const job = this.taskCurrentJob(taskId, agentMemberId);
    return job ? this.cancel(job.id) : false;
  }

  redirectTask(
    taskId: string,
    instruction: string,
    agentMemberId?: string,
  ): Promise<AgentHostJob> {
    return this.serializeTaskControl(taskId, () =>
      this.redirectTaskNow(taskId, instruction, agentMemberId),
    );
  }

  private async redirectTaskNow(
    taskId: string,
    instruction: string,
    agentMemberId?: string,
  ): Promise<AgentHostJob> {
    await this.ready;
    const normalized = instruction.trim();
    if (!normalized || normalized.length > MAX_CONTROL_INSTRUCTION_LENGTH) {
      throw new Error(
        `Task guidance must contain 1-${MAX_CONTROL_INSTRUCTION_LENGTH} characters.`,
      );
    }
    const source = this.taskCurrentJob(taskId, agentMemberId);
    if (!source)
      throw new Error(`Task ${taskId} was not found for this agent.`);
    if (source.controlInstructions.length >= MAX_CONTROL_INSTRUCTIONS) {
      throw new Error(
        `Task ${taskId} already has the maximum ${MAX_CONTROL_INSTRUCTIONS} guidance entries.`,
      );
    }
    if (!TERMINAL.has(source.status)) {
      const cancelled = await this.cancel(source.id);
      if (!cancelled) {
        throw new Error(
          `Task ${taskId} could not stop its current run. Retry after it reaches a safe boundary.`,
        );
      }
    }

    const now = this.now().toISOString();
    const id = this.createId();
    const successor: AgentHostJob = {
      id,
      taskId: source.taskId,
      parentTaskId: source.parentTaskId,
      parentJobId: source.id,
      channelId: source.channelId,
      channelKind: source.channelKind,
      conversationId: source.conversationId,
      triggerMessageId: source.triggerMessageId,
      contextMessageIds: [...source.contextMessageIds],
      mode: source.mode,
      offeredAgentMemberIds: [...source.offeredAgentMemberIds],
      agentId: source.agentId,
      agentMemberId: source.agentMemberId,
      chain: structuredClone(source.chain),
      controlInstructions: [...source.controlInstructions, normalized],
      collaboration: source.collaboration
        ? structuredClone(source.collaboration)
        : undefined,
      outputMessageIds: source.outputMessageIds
        ? [...source.outputMessageIds]
        : undefined,
      maxOutputTokens: source.maxOutputTokens,
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, successor);
    await this.repository.put(successor);
    this.emit({ type: "job", job: successor });
    this.scheduleDrain();
    return structuredClone(successor);
  }

  async dispose(): Promise<void> {
    await this.ready;
    this.accepting = false;
    await Promise.all(
      [...this.running].map((id) => this.cancel(id).catch(() => false)),
    );
  }

  private scheduleDrain(): void {
    if (this.drainQueued || !this.accepting || this.paused) return;
    this.drainQueued = true;
    queueMicrotask(() => {
      this.drainQueued = false;
      void this.drain();
    });
  }

  private taskCurrentJob(
    taskId: string,
    agentMemberId?: string,
  ): AgentHostJob | undefined {
    const jobs = [...this.jobs.values()].filter((job) => job.taskId === taskId);
    const current = jobs.length > 0 ? currentJob(jobs) : undefined;
    return current &&
      (!agentMemberId || current.agentMemberId === agentMemberId)
      ? current
      : undefined;
  }

  private structuredTaskSource(request: {
    sourceJobId: string;
    sourceTaskId: string;
    callerMemberId: string;
  }): AgentHostJob {
    const source = this.jobs.get(request.sourceJobId);
    const current = this.taskCurrentJob(
      request.sourceTaskId,
      request.callerMemberId,
    );
    if (
      !source ||
      source !== current ||
      source.taskId !== request.sourceTaskId ||
      source.agentMemberId !== request.callerMemberId ||
      source.status !== "running"
    ) {
      throw new Error(
        "The structured task caller no longer owns the current running task.",
      );
    }
    return source;
  }

  private findCollaboration(
    kind: AgentHostCollaboration["kind"],
    sourceJobId: string,
    idempotencyKey: string,
    inputHash: string,
  ): AgentHostJob[] {
    const matches = [...this.jobs.values()].filter(
      (job) =>
        job.collaboration?.kind === kind &&
        job.collaboration.sourceJobId === sourceJobId &&
        job.collaboration.idempotencyKey === idempotencyKey,
    );
    if (matches.some((job) => job.collaboration?.inputHash !== inputHash)) {
      throw new Error(
        `Idempotency key ${idempotencyKey} was already used with different input.`,
      );
    }
    return this.currentCollaborationJobs(matches).sort(byCreation);
  }

  private currentCollaborationJobs(jobs: AgentHostJob[]): AgentHostJob[] {
    const byTask = new Map<string, AgentHostJob[]>();
    for (const job of jobs) {
      const runs = byTask.get(job.taskId);
      if (runs) runs.push(job);
      else byTask.set(job.taskId, [job]);
    }
    return [...byTask.values()].map(currentJob);
  }

  private async serializeTaskControl<T>(
    taskId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.taskControlQueues.get(taskId) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.taskControlQueues.set(taskId, settled);
    void settled.then(() => {
      if (this.taskControlQueues.get(taskId) === settled) {
        this.taskControlQueues.delete(taskId);
      }
    });
    return result;
  }

  private async drain(): Promise<void> {
    await this.ready;
    while (this.running.size < this.maxConcurrency) {
      const next = [...this.jobs.values()]
        .filter(
          (job) =>
            job.status === "queued" && !this.activeActors.has(actorKey(job)),
        )
        .sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.id.localeCompare(right.id),
        )[0];
      if (!next) return;
      this.running.add(next.id);
      this.activeActors.add(actorKey(next));
      void this.run(next);
    }
  }

  private async run(job: AgentHostJob): Promise<void> {
    const startedAt = this.now().toISOString();
    job.status = "running";
    job.attempts += 1;
    job.startedAt = startedAt;
    job.updatedAt = startedAt;
    await this.repository.put(job);
    this.emit({ type: "job", job });

    try {
      await this.executor.execute(structuredClone(job), (event) =>
        this.emit(event),
      );
      if (job.status !== "running" || this.pausing.has(job.id)) return;
      await this.finish(job, "completed");
    } catch (error) {
      if (job.status === "running" && !this.pausing.has(job.id)) {
        const message =
          error instanceof Error ? error.message : "Agent work failed.";
        // Jobs outlive the renderer's database, so wiping local state strands
        // work naming a room this profile no longer has. Cancel it rather than
        // failing it: there is nothing to retry and nothing to report.
        await this.finish(
          job,
          message.includes("no longer has") ? "cancelled" : "failed",
          message,
        );
      }
    } finally {
      this.running.delete(job.id);
      this.activeActors.delete(actorKey(job));
      this.scheduleDrain();
    }
  }

  private async finish(
    job: AgentHostJob,
    status: Extract<
      AgentHostJob["status"],
      "completed" | "failed" | "cancelled"
    >,
    error?: string,
  ): Promise<void> {
    const completedAt = this.now().toISOString();
    job.status = status;
    job.error = error;
    job.completedAt = completedAt;
    job.updatedAt = completedAt;
    await this.repository.put(job);
    this.emit({ type: "job", job });
  }

  private emit(event: AgentHostEvent): void {
    const safe =
      event.type === "job"
        ? { ...event, job: structuredClone(event.job) }
        : structuredClone(event);
    for (const listener of this.listeners) listener(safe);
  }
}
