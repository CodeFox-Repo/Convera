import { describe, expect, it } from "vitest";
import type { TraceEvent } from "@/shared/types/trace";
import { TRACE_SCHEMA_VERSION } from "@/shared/types/trace";
import { projectTrace } from "./projector";

function event(
  sequence: number,
  input: Partial<TraceEvent> & Pick<TraceEvent, "spanId" | "spanKind">,
): TraceEvent {
  return {
    schemaVersion: TRACE_SCHEMA_VERSION,
    eventId: `event-${sequence}`,
    traceId: "trace",
    sequence,
    occurredAt: "2026-01-01T00:00:00.000Z",
    recordedAt: "2026-01-01T00:00:00.000Z",
    emitter: "main",
    type: "span.start",
    name: input.spanKind,
    classification: "P0",
    ...input,
  };
}

describe("projectTrace", () => {
  it("projects concurrent parents and causal links into a DAG", () => {
    const graph = projectTrace(
      [
        event(1, { spanId: "mission", spanKind: "mission" }),
        event(2, {
          spanId: "task-a",
          spanKind: "task",
          parentSpanId: "mission",
        }),
        event(3, {
          spanId: "task-b",
          spanKind: "task",
          parentSpanId: "mission",
        }),
        event(4, {
          spanId: "join",
          spanKind: "task",
          parentSpanId: "mission",
          links: [
            { spanId: "task-a", relation: "joins" },
            { spanId: "task-b", relation: "joins" },
          ],
        }),
      ],
      "trace",
    );

    expect(graph.rootSpanIds).toEqual(["mission"]);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { fromSpanId: "mission", toSpanId: "task-a", relation: "parent" },
        { fromSpanId: "mission", toSpanId: "task-b", relation: "parent" },
        { fromSpanId: "task-a", toSpanId: "join", relation: "joins" },
        { fromSpanId: "task-b", toSpanId: "join", relation: "joins" },
      ]),
    );
    expect(graph.orphanSpanIds).toEqual([]);
    expect(graph.cycleSpanIds).toEqual([]);
  });

  it("reports unresolved parents and cycles", () => {
    const graph = projectTrace(
      [
        event(1, {
          spanId: "mission",
          spanKind: "mission",
          links: [{ spanId: "task", relation: "triggered_by" }],
        }),
        event(2, {
          spanId: "task",
          spanKind: "task",
          parentSpanId: "mission",
        }),
        event(3, {
          spanId: "orphan",
          spanKind: "tool",
          parentSpanId: "missing",
        }),
      ],
      "trace",
    );

    expect(graph.orphanSpanIds).toEqual(["orphan"]);
    expect(graph.cycleSpanIds).toEqual(["mission", "task"]);
  });
});
