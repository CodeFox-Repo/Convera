import { describe, expect, it } from "vitest";
import {
  buildMemoryEvaluationReport,
  renderMemoryEvaluationHtml,
  type MemoryEvaluationCase,
} from "./evaluation";

function result(
  mode: "off" | "local",
  overrides: Partial<MemoryEvaluationCase> = {},
): MemoryEvaluationCase {
  return {
    id: `${mode}-case`,
    label: "Recall <secret>",
    capability: "recall",
    kind: "deterministic",
    mode,
    passed: mode === "local",
    contractPassed: true,
    durationMs: mode === "local" ? 12 : 2,
    contextCharacters: mode === "local" ? 400 : 0,
    estimatedContextTokens: mode === "local" ? 100 : 0,
    expected: "SECRET",
    actual: mode === "local" ? "SECRET" : "UNKNOWN",
    ...overrides,
  };
}

describe("memory evaluation report", () => {
  it("summarizes accuracy, latency, context, and real token deltas", () => {
    const report = buildMemoryEvaluationReport({
      runId: "run-1",
      generatedAt: "2026-07-31T00:00:00.000Z",
      realCodex: true,
      repetitions: 1,
      cases: [
        result("off", {
          usage: { inputTokens: 20, outputTokens: 2, totalTokens: 22 },
        }),
        result("local", {
          usage: { inputTokens: 120, outputTokens: 3, totalTokens: 123 },
        }),
      ],
    });

    expect(report.summaries.off.accuracy).toBe(0);
    expect(report.summaries.local.accuracy).toBe(1);
    expect(report.comparison).toMatchObject({
      accuracyPercentagePoints: 100,
      meanLatencyDeltaMs: 10,
      meanEstimatedContextTokenDelta: 100,
      inputTokenDelta: 100,
      outputTokenDelta: 1,
      totalTokenDelta: 101,
      deterministicPrepareLatencyDeltaMs: 10,
    });
    expect(report.breakdowns.realCodex).toBeUndefined();
  });

  it("renders a standalone escaped HTML report", () => {
    const html = renderMemoryEvaluationHtml(
      buildMemoryEvaluationReport({
        runId: "run-<unsafe>",
        realCodex: false,
        repetitions: 1,
        cases: [result("off"), result("local")],
      }),
    );

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("run-&lt;unsafe&gt;");
    expect(html).toContain("Recall &lt;secret&gt;");
    expect(html).not.toContain("run-<unsafe>");
  });
});
