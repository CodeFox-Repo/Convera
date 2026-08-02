import { randomUUID } from "node:crypto";
import type {
  AgentHostDispatch,
  AgentHostEvent,
  AgentHostJob,
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
    if (agentMemberId && job.agentMemberId !== agentMemberId) continue;
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
    const jobs = [...this.jobs.values()].filter(
      (job) =>
        job.taskId === taskId &&
        (!agentMemberId || job.agentMemberId === agentMemberId),
    );
    return jobs.length > 0 ? currentJob(jobs) : undefined;
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
