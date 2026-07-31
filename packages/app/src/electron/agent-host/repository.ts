import { AtomicJsonFile } from "../memory/json-file";
import { SerialTaskQueue } from "../memory/serial-queue";
import type { AgentHostJob } from "@/shared/types/agent-host";
import { z } from "zod";

export interface AgentHostJobRepository {
  list(): Promise<AgentHostJob[]>;
  put(job: AgentHostJob): Promise<void>;
}

export const DEFAULT_MAX_TERMINAL_AGENT_JOBS = 500;

const chainSchema = z.object({
  hops: z.number().int().min(0),
  invoked: z.array(z.string().min(1)),
});

const jobSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  conversationId: z.string().min(1),
  triggerMessageId: z.string().min(1),
  agentMemberId: z.string().min(1),
  chain: chainSchema,
  status: z.enum([
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  attempts: z.number().int().min(0),
  requestId: z.string().min(1).optional(),
  turnId: z.string().min(1).optional(),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

const stateSchema = z.object({
  schemaVersion: z.literal(1),
  jobs: z.array(jobSchema),
});

function prune(jobs: AgentHostJob[], limit: number): AgentHostJob[] {
  const terminal = jobs
    .filter((job) =>
      ["completed", "failed", "cancelled", "interrupted"].includes(job.status),
    )
    .sort(
      (left, right) =>
        left.updatedAt.localeCompare(right.updatedAt) ||
        left.id.localeCompare(right.id),
    );
  const excess = terminal.length - limit;
  if (excess <= 0) return jobs;
  const removed = new Set(terminal.slice(0, excess).map((job) => job.id));
  return jobs.filter((job) => !removed.has(job.id));
}

export class InMemoryAgentHostJobRepository implements AgentHostJobRepository {
  private readonly jobs = new Map<string, AgentHostJob>();

  constructor(initial: AgentHostJob[] = []) {
    for (const job of initial) this.jobs.set(job.id, structuredClone(job));
  }

  async list(): Promise<AgentHostJob[]> {
    return [...this.jobs.values()].map((job) => structuredClone(job));
  }

  async put(job: AgentHostJob): Promise<void> {
    this.jobs.set(job.id, structuredClone(job));
  }
}

export class JsonAgentHostJobRepository implements AgentHostJobRepository {
  private readonly file: AtomicJsonFile;
  private readonly writes = new SerialTaskQueue();
  private readonly maxTerminalJobs: number;

  constructor(options: { path: string; maxTerminalJobs?: number }) {
    this.file = new AtomicJsonFile(options.path);
    this.maxTerminalJobs =
      options.maxTerminalJobs ?? DEFAULT_MAX_TERMINAL_AGENT_JOBS;
    if (!Number.isInteger(this.maxTerminalJobs) || this.maxTerminalJobs < 0) {
      throw new RangeError("maxTerminalJobs must be a non-negative integer.");
    }
  }

  private async readState(): Promise<{
    schemaVersion: 1;
    jobs: AgentHostJob[];
  }> {
    const value = await this.file.read();
    if (value === undefined) return { schemaVersion: 1, jobs: [] };
    return stateSchema.parse(value) as {
      schemaVersion: 1;
      jobs: AgentHostJob[];
    };
  }

  async list(): Promise<AgentHostJob[]> {
    return this.writes.run(async () => {
      const state = await this.readState();
      const jobs = prune(state.jobs, this.maxTerminalJobs);
      if (jobs.length !== state.jobs.length) {
        await this.file.write({ schemaVersion: 1, jobs });
      }
      return structuredClone(jobs);
    });
  }

  async put(job: AgentHostJob): Promise<void> {
    await this.writes.run(async () => {
      const validated = jobSchema.parse(job) as AgentHostJob;
      const state = await this.readState();
      const index = state.jobs.findIndex(
        (candidate) => candidate.id === validated.id,
      );
      if (index === -1) state.jobs.push(structuredClone(validated));
      else state.jobs[index] = structuredClone(validated);
      state.jobs = prune(state.jobs, this.maxTerminalJobs);
      await this.file.write(state);
    });
  }
}
