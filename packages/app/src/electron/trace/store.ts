import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { SerialTaskQueue } from "@/electron/memory/serial-queue";
import type {
  TraceEvent,
  TraceEventInput,
  TraceGraph,
} from "@/shared/types/trace";
import { TRACE_SCHEMA_VERSION } from "@/shared/types/trace";
import { projectTrace } from "./projector";
import { traceEventSchema } from "./schema";

export interface TraceEventSink {
  append(input: TraceEventInput | TraceEventInput[]): Promise<TraceEvent[]>;
}

export interface TraceEventStore extends TraceEventSink {
  graph(traceId: string): Promise<TraceGraph>;
}

export interface TraceStoreHealth {
  validEvents: number;
  corruptLines: number;
}

export const DEFAULT_MAX_TRACE_EVENTS = 50_000;

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export class LocalTraceStore implements TraceEventStore {
  private readonly writes = new SerialTaskQueue();
  private readonly maxEvents: number;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private initialized = false;
  private sequence = 0;
  private eventIds = new Set<string>();
  private eventCount = 0;
  private recoveredCorruptLines = 0;

  constructor(
    readonly path: string,
    options: {
      maxEvents?: number;
      now?: () => Date;
      createId?: () => string;
    } = {},
  ) {
    this.maxEvents = options.maxEvents ?? DEFAULT_MAX_TRACE_EVENTS;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    if (!Number.isInteger(this.maxEvents) || this.maxEvents < 1) {
      throw new RangeError("maxEvents must be a positive integer.");
    }
  }

  async append(
    input: TraceEventInput | TraceEventInput[],
  ): Promise<TraceEvent[]> {
    return this.writes.run(async () => {
      await this.initialize();
      const inputs = Array.isArray(input) ? input : [input];
      const created: TraceEvent[] = [];
      const pendingEventIds = new Set(this.eventIds);
      let nextSequence = this.sequence;
      for (const candidate of inputs) {
        const eventId = candidate.eventId ?? this.createId();
        if (pendingEventIds.has(eventId)) continue;
        const event = traceEventSchema.parse({
          ...candidate,
          schemaVersion: TRACE_SCHEMA_VERSION,
          eventId,
          sequence: ++nextSequence,
          recordedAt: this.now().toISOString(),
        }) as TraceEvent;
        pendingEventIds.add(eventId);
        created.push(event);
      }
      if (created.length === 0) return [];
      await mkdir(dirname(this.path), { recursive: true });
      const handle = await open(this.path, "a", 0o600);
      try {
        await handle.writeFile(
          created.map((event) => `${JSON.stringify(event)}\n`).join(""),
          "utf8",
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      this.sequence = nextSequence;
      for (const event of created) this.eventIds.add(event.eventId);
      this.eventCount += created.length;
      if (this.eventCount > this.maxEvents) await this.prune();
      return structuredClone(created);
    });
  }

  async read(traceId?: string): Promise<TraceEvent[]> {
    return this.writes.run(async () => {
      await this.initialize();
      const { events } = await this.readFile();
      return structuredClone(
        traceId ? events.filter((event) => event.traceId === traceId) : events,
      );
    });
  }

  async listTraceIds(): Promise<string[]> {
    const events = await this.read();
    const latest = new Map<string, number>();
    for (const event of events) latest.set(event.traceId, event.sequence);
    return [...latest.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([traceId]) => traceId);
  }

  async graph(traceId: string): Promise<TraceGraph> {
    return projectTrace(await this.read(traceId), traceId);
  }

  async health(): Promise<TraceStoreHealth> {
    return this.writes.run(async () => {
      await this.initialize();
      const { events, corruptLines } = await this.readFile();
      return {
        validEvents: events.length,
        corruptLines: corruptLines + this.recoveredCorruptLines,
      };
    });
  }

  async idle(): Promise<void> {
    await this.writes.idle();
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    const { events, corruptLines } = await this.readFile();
    if (corruptLines > 0) {
      await this.rewrite(events);
      this.recoveredCorruptLines += corruptLines;
    }
    this.sequence = events.reduce(
      (maximum, event) => Math.max(maximum, event.sequence),
      0,
    );
    this.eventIds = new Set(events.map((event) => event.eventId));
    this.eventCount = events.length;
    this.initialized = true;
  }

  private async readFile(): Promise<{
    events: TraceEvent[];
    corruptLines: number;
  }> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (error) {
      if (isMissingFile(error)) return { events: [], corruptLines: 0 };
      throw error;
    }
    const events: TraceEvent[] = [];
    let corruptLines = 0;
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = traceEventSchema.safeParse(JSON.parse(line));
        if (parsed.success) events.push(parsed.data as TraceEvent);
        else corruptLines += 1;
      } catch {
        corruptLines += 1;
      }
    }
    return { events, corruptLines };
  }

  private async prune(): Promise<void> {
    const { events } = await this.readFile();
    const byTrace = new Map<string, TraceEvent[]>();
    for (const event of events) {
      const trace = byTrace.get(event.traceId);
      if (trace) trace.push(event);
      else byTrace.set(event.traceId, [event]);
    }
    const newestFirst = [...byTrace.values()].sort(
      (left, right) =>
        Math.max(...right.map((event) => event.sequence)) -
        Math.max(...left.map((event) => event.sequence)),
    );
    const kept: TraceEvent[] = [];
    for (const trace of newestFirst) {
      if (kept.length > 0 && kept.length + trace.length > this.maxEvents) {
        continue;
      }
      kept.push(...trace);
    }
    kept.sort((left, right) => left.sequence - right.sequence);
    await this.rewrite(kept);
    this.eventCount = kept.length;
    this.eventIds = new Set(kept.map((event) => event.eventId));
  }

  private async rewrite(events: TraceEvent[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(
        events.map((event) => `${JSON.stringify(event)}\n`).join(""),
        "utf8",
      );
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.path);
      await this.syncParentDirectory();
    } finally {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  private async syncParentDirectory(): Promise<void> {
    let directory: Awaited<ReturnType<typeof open>> | undefined;
    try {
      directory = await open(dirname(this.path), "r");
      await directory.sync();
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined;
      if (!["ENOENT", "EINVAL", "EPERM", "EISDIR"].includes(code ?? "")) {
        throw error;
      }
    } finally {
      await directory?.close().catch(() => undefined);
    }
  }
}
