import { describe, expect, it } from "vitest";
import type { TraceEvent } from "@/shared/types/trace";
import { TRACE_SCHEMA_VERSION } from "@/shared/types/trace";
import { evaluateTrace } from "./evaluation";
import { projectTrace } from "./projector";

function lifecycleEvents(): TraceEvent[] {
  const definitions = [
    ["mission", "mission", undefined],
    ["task", "task", "mission"],
    ["run", "run", "task"],
    ["turn", "turn", "run"],
    ["model", "model", "turn"],
    ["tool", "tool", "model"],
  ] as const;
  let sequence = 0;
  return definitions.flatMap(([spanId, spanKind, parentSpanId]) =>
    (["span.start", "span.end"] as const).map((type) => ({
      schemaVersion: TRACE_SCHEMA_VERSION,
      eventId: `${spanId}:${type}`,
      traceId: "trace",
      spanId,
      parentSpanId,
      sequence: ++sequence,
      occurredAt: "2026-01-01T00:00:00.000Z",
      recordedAt: "2026-01-01T00:00:00.000Z",
      emitter: spanKind === "model" ? "provider" : "main",
      type,
      spanKind,
      name: spanKind,
      status: type === "span.end" ? ("ok" as const) : undefined,
      attributes: spanKind === "tool" ? { toolName: "read_file" } : undefined,
      metrics:
        spanKind === "model" && type === "span.end"
          ? { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
          : undefined,
      classification: "P0" as const,
    })),
  );
}

describe("evaluateTrace", () => {
  it("scores a complete canonical trace and reports process metrics", () => {
    const report = evaluateTrace(projectTrace(lifecycleEvents(), "trace"));
    expect(report.summary).toEqual({ checks: 5, passed: 5, score: 1 });
    expect(report.metrics).toMatchObject({
      spans: 6,
      turns: 1,
      modelCalls: 1,
      toolCalls: 1,
      repeatedToolCalls: 0,
      totalTokens: 15,
    });
  });

  it("fails incomplete runtime evidence", () => {
    const events = lifecycleEvents().filter(
      (event) => !(event.spanId === "tool" && event.type === "span.end"),
    );
    const report = evaluateTrace(projectTrace(events, "trace"));
    expect(
      report.checks.find((entry) => entry.id === "runtime-terminal"),
    ).toMatchObject({
      passed: false,
      actual: "1 incomplete runtime spans",
    });
  });

  it("counts delegated tasks, handoffs, depth, and result receipts", () => {
    const events = lifecycleEvents();
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
          traceId: "trace",
          spanId,
          parentSpanId,
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
    add("task-child", "task", "task", {
      collaborationKind: "delegation",
      collaborationOperationId: "delegation-1",
      taskDepth: 1,
      resultMessageCount: 2,
    });
    add("handoff", "handoff", "task-child", { committed: true });

    const report = evaluateTrace(projectTrace(events, "trace"));
    expect(report.summary.score).toBe(1);
    expect(report.metrics).toMatchObject({
      tasks: 2,
      delegationOperations: 1,
      delegatedTasks: 1,
      handoffs: 1,
      maxTaskDepth: 1,
      resultReceipts: 2,
    });
  });
});
