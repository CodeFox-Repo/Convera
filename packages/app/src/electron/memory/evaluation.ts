import type { LocalAIUsage } from "@/shared/types/local-ai";

export type MemoryEvaluationMode = "off" | "local";
export type MemoryEvaluationKind = "deterministic" | "real-codex";

export interface MemoryEvaluationCase {
  id: string;
  label: string;
  capability: string;
  kind: MemoryEvaluationKind;
  mode: MemoryEvaluationMode;
  passed: boolean;
  contractPassed: boolean;
  durationMs: number;
  contextCharacters?: number;
  estimatedContextTokens?: number;
  usage?: LocalAIUsage;
  expected: string;
  actual: string;
  note?: string;
}

export interface MemoryEvaluationSummary {
  mode: MemoryEvaluationMode;
  cases: number;
  passed: number;
  accuracy: number;
  contractPassed: number;
  contractAccuracy: number;
  meanLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  meanContextCharacters: number;
  meanEstimatedContextTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface MemoryEvaluationReport {
  schemaVersion: 1;
  generatedAt: string;
  runId: string;
  realCodex: boolean;
  dataset: {
    name: string;
    description: string;
    repetitions: number;
  };
  summaries: Record<MemoryEvaluationMode, MemoryEvaluationSummary>;
  breakdowns: {
    deterministic: Record<MemoryEvaluationMode, MemoryEvaluationSummary>;
    realCodex?: Record<MemoryEvaluationMode, MemoryEvaluationSummary>;
  };
  comparison: {
    accuracyPercentagePoints: number;
    meanLatencyDeltaMs: number;
    meanEstimatedContextTokenDelta: number;
    inputTokenDelta?: number;
    outputTokenDelta?: number;
    totalTokenDelta?: number;
    deterministicPrepareLatencyDeltaMs: number;
    realCodexAccuracyPercentagePoints?: number;
    realCodexMeanLatencyDeltaMs?: number;
    realCodexMeanInputTokenDelta?: number;
    realCodexMeanTotalTokenDelta?: number;
  };
  cases: MemoryEvaluationCase[];
}

function rounded(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(quantile * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function optionalSum(
  cases: MemoryEvaluationCase[],
  select: (usage: LocalAIUsage) => number | undefined,
): number | undefined {
  const values = cases
    .map((entry) => entry.usage)
    .filter((usage): usage is LocalAIUsage => usage !== undefined)
    .map(select)
    .filter((value): value is number => value !== undefined);
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0)
    : undefined;
}

export function summarizeMemoryEvaluation(
  mode: MemoryEvaluationMode,
  cases: MemoryEvaluationCase[],
): MemoryEvaluationSummary {
  const selected = cases.filter((entry) => entry.mode === mode);
  const durations = selected.map((entry) => entry.durationMs);
  const contextCharacters = selected.map(
    (entry) => entry.contextCharacters ?? 0,
  );
  const estimatedContextTokens = selected.map(
    (entry) => entry.estimatedContextTokens ?? 0,
  );
  const passed = selected.filter((entry) => entry.passed).length;
  const contractPassed = selected.filter(
    (entry) => entry.contractPassed,
  ).length;
  const denominator = Math.max(selected.length, 1);

  return {
    mode,
    cases: selected.length,
    passed,
    accuracy: rounded(passed / denominator, 4),
    contractPassed,
    contractAccuracy: rounded(contractPassed / denominator, 4),
    meanLatencyMs: rounded(
      durations.reduce((total, value) => total + value, 0) / denominator,
    ),
    p50LatencyMs: rounded(percentile(durations, 0.5)),
    p95LatencyMs: rounded(percentile(durations, 0.95)),
    meanContextCharacters: rounded(
      contextCharacters.reduce((total, value) => total + value, 0) /
        denominator,
    ),
    meanEstimatedContextTokens: rounded(
      estimatedContextTokens.reduce((total, value) => total + value, 0) /
        denominator,
    ),
    inputTokens: optionalSum(selected, (usage) => usage.inputTokens),
    outputTokens: optionalSum(selected, (usage) => usage.outputTokens),
    totalTokens: optionalSum(selected, (usage) => usage.totalTokens),
  };
}

function optionalDelta(
  local: number | undefined,
  off: number | undefined,
): number | undefined {
  return local === undefined || off === undefined ? undefined : local - off;
}

export function buildMemoryEvaluationReport(input: {
  runId: string;
  generatedAt?: string;
  realCodex: boolean;
  repetitions: number;
  cases: MemoryEvaluationCase[];
}): MemoryEvaluationReport {
  const off = summarizeMemoryEvaluation("off", input.cases);
  const local = summarizeMemoryEvaluation("local", input.cases);
  const deterministicCases = input.cases.filter(
    (entry) => entry.kind === "deterministic",
  );
  const realCodexCases = input.cases.filter(
    (entry) => entry.kind === "real-codex",
  );
  const deterministic = {
    off: summarizeMemoryEvaluation("off", deterministicCases),
    local: summarizeMemoryEvaluation("local", deterministicCases),
  };
  const realCodex =
    realCodexCases.length > 0
      ? {
          off: summarizeMemoryEvaluation("off", realCodexCases),
          local: summarizeMemoryEvaluation("local", realCodexCases),
        }
      : undefined;
  const realRepetitions = Math.max(realCodex?.off.cases ?? 0, 1);
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runId: input.runId,
    realCodex: input.realCodex,
    dataset: {
      name: "Convera Off/Local memory smoke benchmark",
      description:
        "Exact-match memory recall plus persistence, correction, forgetting, and scope-isolation checks.",
      repetitions: input.repetitions,
    },
    summaries: { off, local },
    breakdowns: { deterministic, realCodex },
    comparison: {
      accuracyPercentagePoints: rounded((local.accuracy - off.accuracy) * 100),
      meanLatencyDeltaMs: rounded(local.meanLatencyMs - off.meanLatencyMs),
      meanEstimatedContextTokenDelta: rounded(
        local.meanEstimatedContextTokens - off.meanEstimatedContextTokens,
      ),
      inputTokenDelta: optionalDelta(local.inputTokens, off.inputTokens),
      outputTokenDelta: optionalDelta(local.outputTokens, off.outputTokens),
      totalTokenDelta: optionalDelta(local.totalTokens, off.totalTokens),
      deterministicPrepareLatencyDeltaMs: rounded(
        deterministic.local.meanLatencyMs - deterministic.off.meanLatencyMs,
      ),
      realCodexAccuracyPercentagePoints: realCodex
        ? rounded((realCodex.local.accuracy - realCodex.off.accuracy) * 100)
        : undefined,
      realCodexMeanLatencyDeltaMs: realCodex
        ? rounded(realCodex.local.meanLatencyMs - realCodex.off.meanLatencyMs)
        : undefined,
      realCodexMeanInputTokenDelta: realCodex
        ? rounded(
            (optionalDelta(
              realCodex.local.inputTokens,
              realCodex.off.inputTokens,
            ) ?? 0) / realRepetitions,
          )
        : undefined,
      realCodexMeanTotalTokenDelta: realCodex
        ? rounded(
            (optionalDelta(
              realCodex.local.totalTokens,
              realCodex.off.totalTokens,
            ) ?? 0) / realRepetitions,
          )
        : undefined,
    },
    cases: input.cases,
  };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function percentage(value: number): string {
  return `${rounded(value * 100, 1)}%`;
}

function optionalNumber(value: number | undefined): string {
  return value === undefined ? "—" : String(value);
}

export function renderMemoryEvaluationHtml(
  report: MemoryEvaluationReport,
): string {
  const realCodex = report.breakdowns.realCodex;
  const summaryRows = (["off", "local"] as const)
    .map((mode) => {
      const summary = report.summaries[mode];
      return `<tr>
        <td><span class="mode ${mode}">${mode.toUpperCase()}</span></td>
        <td>${percentage(summary.accuracy)}</td>
        <td>${percentage(summary.contractAccuracy)}</td>
        <td>${summary.meanLatencyMs} ms</td>
        <td>${summary.p95LatencyMs} ms</td>
        <td>${summary.meanEstimatedContextTokens}</td>
        <td>${optionalNumber(summary.inputTokens)}</td>
        <td>${optionalNumber(summary.outputTokens)}</td>
      </tr>`;
    })
    .join("\n");
  const caseRows = report.cases
    .map(
      (entry) => `<tr>
        <td>${escapeHtml(entry.label)}</td>
        <td><span class="mode ${entry.mode}">${entry.mode.toUpperCase()}</span></td>
        <td>${escapeHtml(entry.kind)}</td>
        <td class="${entry.passed ? "pass" : "fail"}">${entry.passed ? "PASS" : "MISS"}</td>
        <td class="${entry.contractPassed ? "pass" : "fail"}">${entry.contractPassed ? "PASS" : "FAIL"}</td>
        <td>${rounded(entry.durationMs)} ms</td>
        <td>${entry.estimatedContextTokens ?? 0}</td>
        <td><code>${escapeHtml(entry.actual)}</code></td>
      </tr>`,
    )
    .join("\n");
  const localWidth = Math.max(
    2,
    Math.round(report.summaries.local.accuracy * 100),
  );
  const offWidth = Math.max(2, Math.round(report.summaries.off.accuracy * 100));
  const realLatency =
    report.comparison.realCodexMeanLatencyDeltaMs === undefined
      ? "—"
      : `${report.comparison.realCodexMeanLatencyDeltaMs} ms`;
  const realInputTokens =
    report.comparison.realCodexMeanInputTokenDelta === undefined
      ? "—"
      : String(report.comparison.realCodexMeanInputTokenDelta);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Convera Memory Evaluation</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #0b1020; color: #e8ecf7; }
    body { margin: 0; padding: 32px; }
    main { max-width: 1180px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    .muted { color: #9ba6bd; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin: 24px 0; }
    .card, .panel { background: #121a2e; border: 1px solid #27324b; border-radius: 14px; padding: 18px; }
    .value { font-size: 28px; font-weight: 700; margin-top: 6px; }
    .chart { display: grid; gap: 12px; margin: 20px 0; }
    .track { background: #202a40; border-radius: 7px; overflow: hidden; height: 28px; }
    .bar { height: 100%; display: flex; align-items: center; padding-left: 10px; box-sizing: border-box; font-size: 12px; font-weight: 700; min-width: 46px; }
    .bar.off { width: ${offWidth}%; background: #667085; }
    .bar.local { width: ${localWidth}%; background: #28b487; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { border-bottom: 1px solid #27324b; padding: 11px 9px; text-align: left; vertical-align: top; }
    th { color: #aeb8cd; font-weight: 600; }
    .table-wrap { overflow-x: auto; }
    .mode { border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 700; }
    .mode.off { background: #303a50; }
    .mode.local { background: #153e35; color: #6ee7bd; }
    .pass { color: #6ee7bd; font-weight: 700; }
    .fail { color: #fda4af; font-weight: 700; }
    code { white-space: pre-wrap; color: #cbd5e1; }
  </style>
</head>
<body>
<main>
  <h1>Off vs Local Memory</h1>
  <div class="muted">Run ${escapeHtml(report.runId)} · ${escapeHtml(report.generatedAt)} · ${report.realCodex ? "includes real Codex" : "deterministic only"}</div>
  <div class="cards">
    <div class="card"><div class="muted">Accuracy uplift</div><div class="value">${report.comparison.accuracyPercentagePoints} pp</div></div>
    <div class="card"><div class="muted">Context prepare delta</div><div class="value">${report.comparison.deterministicPrepareLatencyDeltaMs} ms</div></div>
    <div class="card"><div class="muted">Real response latency delta</div><div class="value">${realLatency}</div></div>
    <div class="card"><div class="muted">Real input tokens / turn</div><div class="value">${realInputTokens === "—" ? realInputTokens : `+${realInputTokens}`}</div></div>
  </div>
  <section class="panel">
    <h2>Memory-task accuracy</h2>
    <div class="chart">
      <div><span class="muted">OFF</span><div class="track"><div class="bar off">${percentage(report.summaries.off.accuracy)}</div></div></div>
      <div><span class="muted">LOCAL</span><div class="track"><div class="bar local">${percentage(report.summaries.local.accuracy)}</div></div></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Mode</th><th>Accuracy</th><th>Contract</th><th>Mean latency</th><th>P95</th><th>Est. context tokens</th><th>Input tokens</th><th>Output tokens</th></tr></thead>
      <tbody>${summaryRows}</tbody>
    </table></div>
  </section>
  ${
    realCodex
      ? `<section class="panel" style="margin-top: 16px">
    <h2>Real Codex A/B</h2>
    <p class="muted">${realCodex.off.cases} independent native threads per mode. Local accuracy ${percentage(realCodex.local.accuracy)} vs Off ${percentage(realCodex.off.accuracy)}; mean latency ${realCodex.local.meanLatencyMs} ms vs ${realCodex.off.meanLatencyMs} ms; mean Local input overhead ${realInputTokens} tokens per turn.</p>
  </section>`
      : ""
  }
  <section class="panel" style="margin-top: 16px">
    <h2>Cases</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Case</th><th>Mode</th><th>Kind</th><th>Task</th><th>Contract</th><th>Latency</th><th>Context tokens</th><th>Actual</th></tr></thead>
      <tbody>${caseRows}</tbody>
    </table></div>
  </section>
  <p class="muted">Task accuracy measures whether the requested remembered fact is available. Contract accuracy separately verifies intentional Off behavior and scope/forget safety. This is a smoke benchmark, not a statistical model leaderboard.</p>
</main>
</body>
</html>`;
}
