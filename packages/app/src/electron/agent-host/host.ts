import { randomUUID } from "node:crypto";
import type {
  AgentHostDispatch,
  AgentHostEvent,
  AgentHostJob,
  SettledAgentHostTurn,
} from "@/shared/types/agent-host";
import type { AgentHostJobRepository } from "./repository";

export interface AgentHostExecutor {
  execute(
    job: AgentHostJob,
    emit: (event: AgentHostEvent) => void,
  ): Promise<SettledAgentHostTurn>;
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

function validateDispatch(dispatch: AgentHostDispatch): void {
  if (
    !IDENTIFIER.test(dispatch.channelId) ||
    !IDENTIFIER.test(dispatch.conversationId) ||
    !IDENTIFIER.test(dispatch.triggerMessageId) ||
    !Array.isArray(dispatch.agentMemberIds) ||
    dispatch.agentMemberIds.length === 0 ||
    dispatch.agentMemberIds.length > 16 ||
    !dispatch.agentMemberIds.every(
      (id) =>
        IDENTIFIER.test(id) &&
        id.startsWith("agent:") &&
        dispatch.chain.invoked.includes(id),
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
  private readonly activeConversations = new Set<string>();
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
    for (const agentMemberId of [...new Set(dispatch.agentMemberIds)]) {
      const duplicate = [...this.jobs.values()].find(
        (job) =>
          job.triggerMessageId === dispatch.triggerMessageId &&
          job.agentMemberId === agentMemberId &&
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
        agentMemberId,
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
            job.status === "queued" &&
            !this.activeConversations.has(job.conversationId),
        )
        .sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.id.localeCompare(right.id),
        )[0];
      if (!next) return;
      this.running.add(next.id);
      this.activeConversations.add(next.conversationId);
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
      const settled = await this.executor.execute(
        structuredClone(job),
        (event) => this.emit(event),
      );
      if (job.status !== "running") return;
      await this.finish(job, "completed");
      if (settled.followupAgentMemberIds.length > 0) {
        await this.enqueue({
          channelId: job.channelId,
          conversationId: job.conversationId,
          triggerMessageId: settled.triggerMessageId,
          agentMemberIds: settled.followupAgentMemberIds,
          chain: settled.chain,
        });
      }
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
      this.activeConversations.delete(job.conversationId);
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
