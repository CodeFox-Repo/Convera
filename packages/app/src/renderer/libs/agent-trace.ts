/**
 * What an agent actually did in one turn.
 *
 * A turn is otherwise unobservable: the room shows a message or it shows
 * nothing, and "started typing then said nothing" looks identical to "was
 * never asked". Both have cost real debugging time. This records the tool
 * calls a turn made, in order, so the question can be answered by looking
 * instead of by reproducing it.
 *
 * Deliberately cheap: a bounded ring of rows, no indices beyond the ones
 * needed to read a member's recent turns, and every write is best-effort —
 * a diagnostic must never break the path it observes.
 */
import { db } from "./db";
import type { LocalAIStreamEvent } from "@/shared/types/local-ai";

/** Kept small; this is a debugging aid, not an audit log. */
export const AGENT_TRACE_LIMIT = 200;

/** One turn being watched. Lives only until the turn ends. */
interface OpenTrace {
  trace: AgentTrace;
  startedAtMs: number;
  toolNames: Map<string, string>;
}

const open = new Map<string, OpenTrace>();

export interface AgentTraceStep {
  /**
   * Bare tool name — `send_message`, `read_channel` — or `(re-asked)` for the
   * boundary between a silent turn and the one that follows it.
   */
  tool: string;
  /** Milliseconds from the turn's first event. */
  at: number;
  outcome: "started" | "completed" | "error" | "denied" | "note";
  /** Present on error, and on send_message: what it tried to say. */
  detail?: string;
}

/**
 * Marks the point where a silent direct offer was asked again. Two tool
 * sequences in one trace look like a duplicate call without it.
 */
export function noteRetry(requestId: string): void {
  const entry = open.get(requestId);
  if (!entry) return;
  entry.trace.steps.push({
    tool: "(re-asked)",
    at: Date.now() - entry.startedAtMs,
    outcome: "note",
    detail: "the turn ended without speaking, so it was asked once more",
  });
  // The second turn writes its own reply text; keep the first turn's, which
  // is the evidence for why nothing was said.
  entry.trace.turnText = entry.trace.turnText?.trim() || undefined;
}

export interface AgentTrace {
  id: string;
  conversationId: string;
  memberId: string;
  jobId?: string;
  requestId: string;
  steps: AgentTraceStep[];
  /** True when the turn called send_message at least once. */
  spoke: boolean;
  /** Set when the turn ended abnormally. */
  error?: string;
  /** The turn's own output — invisible to the room, but the reason it stayed quiet. */
  turnText?: string;
  startedAt: Date;
  endedAt?: Date;
}

const TURN_TEXT_MAX = 400;
const DETAIL_MAX = 120;

function toolNameOf(chunk: unknown): string | undefined {
  const name = (chunk as { toolName?: string }).toolName;
  return typeof name === "string" ? name.replace(/^workspace:/, "") : undefined;
}

function callIdOf(chunk: unknown): string | undefined {
  const id = (chunk as { toolCallId?: string }).toolCallId;
  return typeof id === "string" && id ? id : undefined;
}

export function beginTrace(input: {
  requestId: string;
  conversationId: string;
  memberId: string;
  jobId?: string;
}): void {
  open.set(input.requestId, {
    trace: {
      id: `${input.requestId}:${Date.now()}`,
      conversationId: input.conversationId,
      memberId: input.memberId,
      jobId: input.jobId,
      requestId: input.requestId,
      steps: [],
      spoke: false,
      startedAt: new Date(),
    },
    startedAtMs: Date.now(),
    toolNames: new Map(),
  });
}

/** Feeds one stream event into the open trace for its request. */
export function recordTrace(event: LocalAIStreamEvent): void {
  const entry = open.get(event.requestId);
  if (!entry) return;
  const at = Date.now() - entry.startedAtMs;

  if (event.type === "error") {
    entry.trace.error = event.error.message;
    return;
  }

  if (event.type === "interaction") {
    // The tool actually running, with its arguments — the only place the
    // message text is visible before it reaches the transcript.
    const input = event.input as {
      kind?: string;
      content?: string;
      emoji?: string;
    } | null;
    if (input?.kind === "send_message") {
      entry.trace.spoke = true;
      const step = entry.trace.steps.findLast(
        (candidate) =>
          candidate.tool === "send_message" && candidate.outcome === "started",
      );
      if (step) step.detail = (input.content ?? "").slice(0, DETAIL_MAX);
    }
    // A reaction counts as having acted — the executor treats it as an
    // answer, so a trace reading "stayed quiet" for a 👍 would lie.
    if (input?.kind === "add_reaction") {
      entry.trace.spoke = true;
      const step = entry.trace.steps.findLast(
        (candidate) =>
          candidate.tool === "add_reaction" && candidate.outcome === "started",
      );
      if (step) step.detail = input.emoji ?? "";
    }
    return;
  }

  if (event.type !== "ui-message") return;
  const chunk = event.chunk as { type?: string; delta?: string };

  if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
    entry.trace.turnText = ((entry.trace.turnText ?? "") + chunk.delta).slice(
      0,
      TURN_TEXT_MAX,
    );
    return;
  }

  const callId = callIdOf(chunk);
  if (!callId) return;

  if (chunk.type === "tool-input-start") {
    const tool = toolNameOf(chunk) ?? "unknown";
    entry.toolNames.set(callId, tool);
    entry.trace.steps.push({ tool, at, outcome: "started" });
    return;
  }

  const tool = entry.toolNames.get(callId);
  if (!tool) return;
  const step = entry.trace.steps.findLast(
    (candidate) => candidate.tool === tool && candidate.outcome === "started",
  );
  if (!step) return;

  if (chunk.type === "tool-output-available") step.outcome = "completed";
  else if (chunk.type === "tool-output-denied") step.outcome = "denied";
  else if (
    chunk.type === "tool-output-error" ||
    chunk.type === "tool-input-error"
  ) {
    step.outcome = "error";
    const text = (chunk as { errorText?: string }).errorText;
    if (typeof text === "string") step.detail = text.slice(0, DETAIL_MAX);
  }
}

/** Closes the trace and persists it. Safe to call more than once. */
export async function endTrace(requestId: string): Promise<void> {
  const entry = open.get(requestId);
  if (!entry) return;
  open.delete(requestId);
  entry.trace.endedAt = new Date();
  try {
    await db.agentTraces.put(entry.trace);
    const excess = (await db.agentTraces.count()) - AGENT_TRACE_LIMIT;
    if (excess > 0) {
      const oldest = await db.agentTraces
        .orderBy("startedAt")
        .limit(excess)
        .primaryKeys();
      await db.agentTraces.bulkDelete(oldest);
    }
  } catch {
    // Never let a diagnostic break the turn it was watching.
  }
}
