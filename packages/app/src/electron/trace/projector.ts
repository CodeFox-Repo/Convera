import type {
  TraceEdge,
  TraceEvent,
  TraceGraph,
  TraceLink,
  TraceSpan,
} from "@/shared/types/trace";

function uniqueLinks(links: TraceLink[]): TraceLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.traceId ?? ""}:${link.spanId}:${link.relation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addEdge(edges: TraceEdge[], seen: Set<string>, edge: TraceEdge): void {
  const key = `${edge.fromSpanId}:${edge.toSpanId}:${edge.relation}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push(edge);
}

function cycleMembers(spanIds: string[], edges: TraceEdge[]): string[] {
  const adjacency = new Map<string, string[]>();
  for (const spanId of spanIds) adjacency.set(spanId, []);
  for (const edge of edges) {
    if (!adjacency.has(edge.fromSpanId) || !adjacency.has(edge.toSpanId)) {
      continue;
    }
    adjacency.get(edge.fromSpanId)?.push(edge.toSpanId);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();
  const stack: string[] = [];

  const visit = (spanId: string): void => {
    if (visited.has(spanId)) return;
    if (visiting.has(spanId)) {
      const index = stack.lastIndexOf(spanId);
      for (const member of stack.slice(Math.max(index, 0))) cyclic.add(member);
      cyclic.add(spanId);
      return;
    }
    visiting.add(spanId);
    stack.push(spanId);
    for (const child of adjacency.get(spanId) ?? []) visit(child);
    stack.pop();
    visiting.delete(spanId);
    visited.add(spanId);
  };

  for (const spanId of spanIds) visit(spanId);
  return [...cyclic].sort();
}

export function projectTrace(
  events: TraceEvent[],
  traceId: string,
): TraceGraph {
  const selected = events
    .filter((event) => event.traceId === traceId)
    .sort((left, right) => left.sequence - right.sequence);
  const bySpan = new Map<string, TraceSpan>();

  for (const event of selected) {
    const existing = bySpan.get(event.spanId);
    const span = existing ?? {
      traceId,
      spanId: event.spanId,
      parentSpanId: event.parentSpanId,
      spanKind: event.spanKind,
      name: event.name,
      attributes: {},
      metrics: {},
      links: [],
      events: [],
    };
    span.parentSpanId ??= event.parentSpanId;
    span.attributes = { ...span.attributes, ...(event.attributes ?? {}) };
    span.metrics = { ...span.metrics, ...(event.metrics ?? {}) };
    span.links = uniqueLinks([...span.links, ...(event.links ?? [])]);
    span.events.push(event);
    if (event.type === "span.start") span.startedAt ??= event.occurredAt;
    if (event.type === "span.end") span.endedAt = event.occurredAt;
    if (event.status) span.status = event.status;
    bySpan.set(event.spanId, span);
  }

  const spans = [...bySpan.values()];
  const spanIds = new Set(spans.map((span) => span.spanId));
  const edges: TraceEdge[] = [];
  const seenEdges = new Set<string>();
  const orphanSpanIds = new Set<string>();

  for (const span of spans) {
    if (span.parentSpanId) {
      if (spanIds.has(span.parentSpanId)) {
        addEdge(edges, seenEdges, {
          fromSpanId: span.parentSpanId,
          toSpanId: span.spanId,
          relation: "parent",
        });
      } else {
        orphanSpanIds.add(span.spanId);
      }
    }
    for (const link of span.links) {
      if (link.traceId && link.traceId !== traceId) continue;
      if (!spanIds.has(link.spanId)) {
        orphanSpanIds.add(span.spanId);
        continue;
      }
      const predecessor = link.relation !== "produces";
      addEdge(edges, seenEdges, {
        fromSpanId: predecessor ? link.spanId : span.spanId,
        toSpanId: predecessor ? span.spanId : link.spanId,
        relation: link.relation,
      });
    }
  }

  return {
    traceId,
    spans,
    edges,
    rootSpanIds: spans
      .filter((span) => !span.parentSpanId)
      .map((span) => span.spanId),
    orphanSpanIds: [...orphanSpanIds].sort(),
    cycleSpanIds: cycleMembers([...spanIds], edges),
    eventCount: selected.length,
  };
}
