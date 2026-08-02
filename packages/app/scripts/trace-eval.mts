import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateTrace } from "@/electron/trace/evaluation";
import { projectTrace } from "@/electron/trace/projector";
import { LocalTraceStore } from "@/electron/trace/store";
import type {
  TraceEvent,
  TraceEventInput,
  TraceSpanKind,
} from "@/shared/types/trace";
import { TRACE_SCHEMA_VERSION } from "@/shared/types/trace";

const pathArgument = process.argv.find((argument) =>
  argument.startsWith("--path="),
);
const requestedPath = pathArgument?.slice("--path=".length);
const runId = new Date().toISOString().replaceAll(/[:.]/g, "-");
const outputDirectory = resolve(
  ".automation",
  "artifacts",
  "trace-eval",
  runId,
);

function syntheticTrace(
  name: string,
  parallelTasks: number,
  terminalStatus: "ok" | "interrupted" = "ok",
): TraceEvent[] {
  const traceId = `synthetic:${name}`;
  const occurredAt = "2026-01-01T00:00:00.000Z";
  const inputs: TraceEventInput[] = [];
  const add = (
    spanId: string,
    spanKind: TraceSpanKind,
    type: "span.start" | "span.end",
    parentSpanId?: string,
    metrics?: Record<string, number>,
  ) => {
    inputs.push({
      eventId: `${spanId}:${type}`,
      traceId,
      spanId,
      parentSpanId,
      occurredAt,
      emitter:
        spanKind === "model"
          ? "provider"
          : spanKind === "tool"
            ? "tool"
            : "main",
      type,
      spanKind,
      name: spanKind,
      status: type === "span.end" ? terminalStatus : undefined,
      attributes:
        spanKind === "tool" ? { toolName: `tool-${spanId.at(-1)}` } : undefined,
      metrics,
      classification: "P0",
    });
  };

  add("mission", "mission", "span.start");
  for (let index = 0; index < parallelTasks; index += 1) {
    const suffix = String(index + 1);
    add(`task-${suffix}`, "task", "span.start", "mission");
    add(`run-${suffix}`, "run", "span.start", `task-${suffix}`);
    add(`turn-${suffix}`, "turn", "span.start", `run-${suffix}`);
    add(`model-${suffix}`, "model", "span.start", `turn-${suffix}`);
    add(`tool-${suffix}`, "tool", "span.start", `model-${suffix}`);
    add(`tool-${suffix}`, "tool", "span.end", `model-${suffix}`);
    add(`model-${suffix}`, "model", "span.end", `turn-${suffix}`, {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
    add(`turn-${suffix}`, "turn", "span.end", `run-${suffix}`);
    add(`run-${suffix}`, "run", "span.end", `task-${suffix}`);
  }
  return inputs.map((input, index) => ({
    ...input,
    eventId: input.eventId ?? randomUUID(),
    schemaVersion: TRACE_SCHEMA_VERSION,
    sequence: index + 1,
    recordedAt: occurredAt,
  })) as TraceEvent[];
}

function structuredCollaborationTrace(): TraceEvent[] {
  const events = syntheticTrace("structured-collaboration", 1);
  let sequence = events.length;
  const add = (
    spanId: string,
    spanKind: "task" | "handoff",
    parentSpanId: string,
    attributes: Record<string, string | number | boolean>,
  ) => {
    for (const type of ["span.start", "span.end"] as const) {
      events.push({
        schemaVersion: TRACE_SCHEMA_VERSION,
        eventId: `${spanId}:${type}`,
        traceId: "synthetic:structured-collaboration",
        spanId,
        parentSpanId,
        links:
          spanKind === "task"
            ? [{ spanId: "run-1", relation: "triggered_by" }]
            : [{ spanId: "run-1", relation: "handoff" }],
        sequence: ++sequence,
        occurredAt: "2026-01-01T00:00:01.000Z",
        recordedAt: "2026-01-01T00:00:01.000Z",
        emitter: "main",
        type,
        spanKind,
        name: spanKind,
        status: type === "span.end" ? "ok" : undefined,
        attributes,
        classification: "P0",
      });
    }
  };
  add("task-delegated", "task", "task-1", {
    collaborationKind: "delegation",
    collaborationOperationId: "delegation-1",
    taskDepth: 1,
    resultMessageCount: 1,
  });
  add("handoff-1", "handoff", "task-delegated", {
    operationId: "handoff-1",
    committed: true,
  });
  return events;
}

const cases = [];
if (requestedPath) {
  const store = new LocalTraceStore(resolve(requestedPath));
  for (const traceId of await store.listTraceIds()) {
    cases.push(evaluateTrace(await store.graph(traceId)));
  }
} else {
  for (const [name, tasks, terminalStatus] of [
    ["single-task", 1, "ok"],
    ["parallel-two-task", 2, "ok"],
    ["parallel-four-task", 4, "ok"],
    ["interrupted-recovery", 1, "interrupted"],
  ] as const) {
    const events = syntheticTrace(name, tasks, terminalStatus);
    cases.push(evaluateTrace(projectTrace(events, `synthetic:${name}`)));
  }
  const structured = structuredCollaborationTrace();
  cases.push(
    evaluateTrace(
      projectTrace(structured, "synthetic:structured-collaboration"),
    ),
  );
}

const report = {
  schemaVersion: 1,
  runId,
  generatedAt: new Date().toISOString(),
  source: requestedPath
    ? resolve(requestedPath)
    : "built-in synthetic scenarios",
  summary: {
    traces: cases.length,
    passed: cases.filter((entry) => entry.summary.score === 1).length,
    meanScore:
      cases.length === 0
        ? 0
        : Math.round(
            (cases.reduce((total, entry) => total + entry.summary.score, 0) /
              cases.length) *
              10_000,
          ) / 10_000,
  },
  cases,
};

await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(outputDirectory, "report.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...report.summary, outputPath }, null, 2));

if (report.summary.passed !== report.summary.traces) process.exitCode = 1;
