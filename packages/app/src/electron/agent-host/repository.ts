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

const statusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

const legacyJobSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  conversationId: z.string().min(1),
  triggerMessageId: z.string().min(1),
  agentMemberId: z.string().min(1),
  chain: chainSchema,
  status: statusSchema,
  attempts: z.number().int().min(0),
  requestId: z.string().min(1).optional(),
  turnId: z.string().min(1).optional(),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

const jobSchema = legacyJobSchema.extend({
  contextMessageIds: z.array(z.string().min(1)).min(1).max(500),
  mode: z.enum(["open-floor", "direct"]),
  offeredAgentMemberIds: z.array(z.string().min(1)).max(16),
  agentId: z.string().min(1),
});

const legacyStateSchema = z.object({
  schemaVersion: z.literal(1),
  jobs: z.array(legacyJobSchema),
});

const stateSchema = z.object({
  schemaVersion: z.literal(2),
  jobs: z.array(jobSchema),
});

type LegacyJob = z.infer<typeof legacyJobSchema>;

function migrateLegacyJob(job: LegacyJob): AgentHostJob {
  const incompatible = job.status === "queued" || job.status === "running";
  return {
    ...job,
    agentId: job.agentMemberId.startsWith("agent:")
      ? job.agentMemberId.slice("agent:".length)
      : job.agentMemberId,
    contextMessageIds: [job.triggerMessageId],
    mode: "direct",
    offeredAgentMemberIds: [job.agentMemberId],
    status: incompatible ? "interrupted" : job.status,
    error: incompatible
      ? "This queued Agent Host job predates frozen offer context and was not replayed."
      : job.error,
    completedAt: incompatible
      ? (job.completedAt ?? job.updatedAt)
      : job.completedAt,
  };
}

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
    state: {
      schemaVersion: 2;
      jobs: AgentHostJob[];
    };
    migrated: boolean;
  }> {
    const value = await this.file.read();
    if (value === undefined) {
      return { state: { schemaVersion: 2, jobs: [] }, migrated: false };
    }
    const version = z.object({ schemaVersion: z.number() }).parse(value);
    if (version.schemaVersion === 1) {
      const legacy = legacyStateSchema.parse(value);
      return {
        state: {
          schemaVersion: 2,
          jobs: legacy.jobs.map(migrateLegacyJob),
        },
        migrated: true,
      };
    }
    return {
      state: stateSchema.parse(value) as {
        schemaVersion: 2;
        jobs: AgentHostJob[];
      },
      migrated: false,
    };
  }

  private async writeState(state: {
    schemaVersion: 2;
    jobs: AgentHostJob[];
  }): Promise<void> {
    await this.file.write(stateSchema.parse(state));
  }

  async list(): Promise<AgentHostJob[]> {
    return this.writes.run(async () => {
      const { state, migrated } = await this.readState();
      const jobs = prune(state.jobs, this.maxTerminalJobs);
      if (migrated || jobs.length !== state.jobs.length) {
        await this.writeState({ schemaVersion: 2, jobs });
      }
      return structuredClone(jobs);
    });
  }

  async put(job: AgentHostJob): Promise<void> {
    await this.writes.run(async () => {
      const validated = jobSchema.parse(job) as AgentHostJob;
      const { state } = await this.readState();
      const index = state.jobs.findIndex(
        (candidate) => candidate.id === validated.id,
      );
      if (index === -1) state.jobs.push(structuredClone(validated));
      else state.jobs[index] = structuredClone(validated);
      state.jobs = prune(state.jobs, this.maxTerminalJobs);
      await this.writeState(state);
    });
  }
}
