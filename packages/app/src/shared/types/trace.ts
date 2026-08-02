export const TRACE_SCHEMA_VERSION = 1 as const;

export type TraceSpanKind =
  | "mission"
  | "task"
  | "run"
  | "turn"
  | "model"
  | "tool"
  | "handoff"
  | "memory.mutation"
  | "artifact"
  | "automation.action"
  | "eval.grader";

export type TraceEventType = "span.start" | "span.event" | "span.end";

export type TraceStatus =
  | "ok"
  | "error"
  | "cancelled"
  | "interrupted"
  | "uncertain";

export type TraceClassification = "P0" | "P1" | "P2" | "P3";

export type TraceLinkRelation =
  | "triggered_by"
  | "consumes"
  | "produces"
  | "joins"
  | "supersedes"
  | "handoff";

export type TraceAttributeValue = string | number | boolean | null | string[];

export type TraceAttributes = Record<string, TraceAttributeValue>;

export interface TraceLink {
  traceId?: string;
  spanId: string;
  relation: TraceLinkRelation;
}

export interface TraceEvent {
  schemaVersion: typeof TRACE_SCHEMA_VERSION;
  eventId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  links?: TraceLink[];
  sequence: number;
  occurredAt: string;
  recordedAt: string;
  emitter: "main" | "provider" | "tool" | "memory" | "automation" | "eval";
  type: TraceEventType;
  spanKind: TraceSpanKind;
  name: string;
  status?: TraceStatus;
  attributes?: TraceAttributes;
  metrics?: Record<string, number>;
  classification: TraceClassification;
}

export type TraceEventInput = Omit<
  TraceEvent,
  "schemaVersion" | "sequence" | "recordedAt" | "eventId"
> & {
  eventId?: string;
};

export interface TraceEdge {
  fromSpanId: string;
  toSpanId: string;
  relation: "parent" | TraceLinkRelation;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  spanKind: TraceSpanKind;
  name: string;
  startedAt?: string;
  endedAt?: string;
  status?: TraceStatus;
  attributes: TraceAttributes;
  metrics: Record<string, number>;
  links: TraceLink[];
  events: TraceEvent[];
}

export interface TraceGraph {
  traceId: string;
  spans: TraceSpan[];
  edges: TraceEdge[];
  rootSpanIds: string[];
  orphanSpanIds: string[];
  cycleSpanIds: string[];
  eventCount: number;
}
