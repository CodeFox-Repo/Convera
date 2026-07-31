import { randomUUID } from "node:crypto";
import type {
  AgentHostDispatch,
  AgentHostEvent,
  AgentHostJob,
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

function actorKey(job: Pick<AgentHostJob, "conversationId" | "agentMemberId">) {
  return `${job.conversationId}\0${job.agentMemberId}`;
}

function validateDispatch(dispatch: AgentHostDispatch): void {
  if (
    !IDENTIFIER.test(dispatch.channelId) ||
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
    !dispatch.targets.every(
      (target) =>
        IDENTIFIER.test(target.agentId) &&
        IDENTIFIER.test(target.memberId) &&
        target.memberId.startsWith("agent:") &&
        dispatch.chain.invoked.includes(target.memberId) &&
        dispatch.offeredAgentMemberIds.includes(target.memberId),
    ) ||
    !Number.isInteger(dispatch.chain.hops) ||
    dispatch.chain.hops < 0 ||
    dispatch.chain.hops > 3 ||
    !Array.isArray(dispatch.chain.invoked) ||
    dispatch.chain.invoked.length > 16 ||
    !dispatch.chain.invoked.every((id) => IDENTIFIER.test(id))
  ) {
    throw new Error("Invalid Agent Host dispatch.");
  }
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
  private readonly activeActors = new Set<string>();
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
      const job: AgentHostJob = {
        id: this.createId(),
        channelId: dispatch.channelId,
        conversationId: dispatch.conversationId,
        triggerMessageId: dispatch.triggerMessageId,
        contextMessageIds: [...dispatch.contextMessageIds],
        mode: dispatch.mode,
        offeredAgentMemberIds: [...dispatch.offeredAgentMemberIds],
        agentId: target.agentId,
        agentMemberId: target.memberId,
        chain: structuredClone(dispatch.chain),
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
      if (job.status !== "running") return;
      await this.finish(job, "completed");
    } catch (error) {
      if (job.status === "running") {
        await this.finish(
          job,
          "failed",
          error instanceof Error ? error.message : "Agent work failed.",
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
