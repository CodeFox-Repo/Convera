import { z } from "zod";
import { TRACE_SCHEMA_VERSION, type TraceEvent } from "@/shared/types/trace";

const attributeValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
]);

const linkSchema = z.object({
  traceId: z.string().min(1).optional(),
  spanId: z.string().min(1),
  relation: z.enum([
    "triggered_by",
    "consumes",
    "produces",
    "joins",
    "supersedes",
    "handoff",
  ]),
});

export const traceEventSchema = z.object({
  schemaVersion: z.literal(TRACE_SCHEMA_VERSION),
  eventId: z.string().min(1),
  traceId: z.string().min(1),
  spanId: z.string().min(1),
  parentSpanId: z.string().min(1).optional(),
  links: z.array(linkSchema).optional(),
  sequence: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  emitter: z.enum(["main", "provider", "tool", "memory", "automation", "eval"]),
  type: z.enum(["span.start", "span.event", "span.end"]),
  spanKind: z.enum([
    "mission",
    "task",
    "run",
    "turn",
    "model",
    "tool",
    "handoff",
    "memory.mutation",
    "artifact",
    "automation.action",
    "eval.grader",
  ]),
  name: z.string().min(1),
  status: z
    .enum(["ok", "error", "cancelled", "interrupted", "uncertain"])
    .optional(),
  attributes: z.record(z.string(), attributeValueSchema).optional(),
  metrics: z.record(z.string(), z.number().finite()).optional(),
  classification: z.enum(["P0", "P1", "P2", "P3"]),
});

export function parseTraceEvent(value: unknown): TraceEvent {
  return traceEventSchema.parse(value) as TraceEvent;
}
