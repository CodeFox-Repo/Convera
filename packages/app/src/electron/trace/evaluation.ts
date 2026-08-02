import type { TraceGraph, TraceSpan } from "@/shared/types/trace";

export interface TraceEvaluationCheck {
  id: string;
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface TraceEvaluationReport {
  schemaVersion: 1;
  traceId: string;
  generatedAt: string;
  summary: {
    checks: number;
    passed: number;
    score: number;
  };
  metrics: {
    spans: number;
    tasks: number;
    delegationOperations: number;
    delegatedTasks: number;
    handoffs: number;
    maxTaskDepth: number;
    resultReceipts: number;
    turns: number;
    modelCalls: number;
    toolCalls: number;
    repeatedToolCalls: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  checks: TraceEvaluationCheck[];
}

const expectedParent: Partial<
  Record<TraceSpan["spanKind"], TraceSpan["spanKind"]>
> = {
  run: "task",
  turn: "run",
  model: "turn",
  tool: "model",
  handoff: "task",
};

function hasCanonicalParent(
  span: TraceSpan,
  byId: Map<string, TraceSpan>,
): boolean {
  if (span.spanKind === "task") {
    const parentKind = span.parentSpanId
      ? byId.get(span.parentSpanId)?.spanKind
      : undefined;
    return parentKind === "mission" || parentKind === "task";
  }
  const parentKind = expectedParent[span.spanKind];
  return (
    !parentKind || byId.get(span.parentSpanId ?? "")?.spanKind === parentKind
  );
}

function check(
  id: string,
  label: string,
  passed: boolean,
  expected: string,
  actual: string,
): TraceEvaluationCheck {
  return { id, label, passed, expected, actual };
}

function optionalSum(
  spans: TraceSpan[],
  metric: "inputTokens" | "outputTokens" | "totalTokens",
): number | undefined {
  const values = spans
    .map((span) => span.metrics[metric])
    .filter((value): value is number => value !== undefined);
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0)
    : undefined;
}

export function evaluateTrace(
  graph: TraceGraph,
  generatedAt = new Date().toISOString(),
): TraceEvaluationReport {
  const byId = new Map(graph.spans.map((span) => [span.spanId, span]));
  const missionRoots = graph.rootSpanIds.filter(
    (spanId) => byId.get(spanId)?.spanKind === "mission",
  );
  const hierarchyViolations = graph.spans.filter(
    (span) => !hasCanonicalParent(span, byId),
  );
  const runtimeSpans = graph.spans.filter((span) =>
    ["run", "turn", "model", "tool", "handoff"].includes(span.spanKind),
  );
  const incompleteRuntimeSpans = runtimeSpans.filter(
    (span) => !span.startedAt || !span.endedAt,
  );
  const toolNames = graph.spans
    .filter((span) => span.spanKind === "tool")
    .map((span) => String(span.attributes.toolName ?? span.name));
  const repeatedToolCalls = toolNames.length - new Set(toolNames).size;
  const taskSpans = graph.spans.filter((span) => span.spanKind === "task");
  const delegatedTasks = taskSpans.filter(
    (span) => span.attributes.collaborationKind === "delegation",
  );
  const delegationOperations = new Set(
    delegatedTasks
      .map((span) => span.attributes.collaborationOperationId)
      .filter((value): value is string => typeof value === "string"),
  ).size;
  const taskDepths = taskSpans.map((span) => {
    const depth = span.attributes.taskDepth;
    return typeof depth === "number" ? depth : 0;
  });
  const checks = [
    check(
      "mission-root",
      "Trace has exactly one Mission root",
      missionRoots.length === 1 && graph.rootSpanIds.length === 1,
      "1 Mission root",
      `${missionRoots.length} Mission roots, ${graph.rootSpanIds.length} total roots`,
    ),
    check(
      "no-orphans",
      "Every parent and local link resolves",
      graph.orphanSpanIds.length === 0,
      "0 orphan spans",
      `${graph.orphanSpanIds.length} orphan spans`,
    ),
    check(
      "acyclic",
      "Parent and causal links form a DAG",
      graph.cycleSpanIds.length === 0,
      "0 cyclic spans",
      `${graph.cycleSpanIds.length} cyclic spans`,
    ),
    check(
      "canonical-hierarchy",
      "Task, Run, Turn, Model, Tool, and Handoff use the canonical parent chain",
      hierarchyViolations.length === 0,
      "0 hierarchy violations",
      `${hierarchyViolations.length} hierarchy violations`,
    ),
    check(
      "runtime-terminal",
      "Every runtime span has start and end evidence",
      incompleteRuntimeSpans.length === 0,
      "0 incomplete runtime spans",
      `${incompleteRuntimeSpans.length} incomplete runtime spans`,
    ),
  ];
  const passed = checks.filter((entry) => entry.passed).length;
  const modelSpans = graph.spans.filter((span) => span.spanKind === "model");
  return {
    schemaVersion: 1,
    traceId: graph.traceId,
    generatedAt,
    summary: {
      checks: checks.length,
      passed,
      score: Math.round((passed / checks.length) * 10_000) / 10_000,
    },
    metrics: {
      spans: graph.spans.length,
      tasks: taskSpans.length,
      delegationOperations,
      delegatedTasks: delegatedTasks.length,
      handoffs: graph.spans.filter((span) => span.spanKind === "handoff")
        .length,
      maxTaskDepth: Math.max(0, ...taskDepths),
      resultReceipts: taskSpans.reduce((total, span) => {
        const count = span.attributes.resultMessageCount;
        return total + (typeof count === "number" ? count : 0);
      }, 0),
      turns: graph.spans.filter((span) => span.spanKind === "turn").length,
      modelCalls: modelSpans.length,
      toolCalls: toolNames.length,
      repeatedToolCalls,
      inputTokens: optionalSum(modelSpans, "inputTokens"),
      outputTokens: optionalSum(modelSpans, "outputTokens"),
      totalTokens: optionalSum(modelSpans, "totalTokens"),
    },
    checks,
  };
}
