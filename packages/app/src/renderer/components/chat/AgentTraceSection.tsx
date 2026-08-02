import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/renderer/libs/db";
import type { AgentTrace, AgentTraceStep } from "@/renderer/libs/agent-trace";
import { cn } from "@/renderer/libs/utils/tailwind";

/** Most recent turns for one member, newest first. */
function useTraces(memberId: string, limit = 8): AgentTrace[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.agentTraces
      .where("memberId")
      .equals(memberId)
      .reverse()
      .sortBy("startedAt");
    // `rows` is already newest-first, so the newest `limit` are at the head.
    // Taking the tail returned an agent's oldest turns and froze the panel.
    return rows.slice(0, limit);
  }, [memberId, limit]);
}

const OUTCOME_STYLE: Record<AgentTraceStep["outcome"], string> = {
  started: "text-muted-foreground",
  completed: "text-sidebar-foreground",
  error: "text-destructive",
  denied: "text-destructive",
  note: "text-muted-foreground italic",
};

function relative(date: Date): string {
  const seconds = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function Turn({ trace }: { trace: AgentTrace }) {
  const duration =
    trace.endedAt &&
    Math.round(
      (new Date(trace.endedAt).getTime() -
        new Date(trace.startedAt).getTime()) /
        100,
    ) / 10;

  return (
    <li className="rounded-md bg-sidebar-accent/40 p-2">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-medium",
            trace.spoke
              ? "bg-primary/15 text-primary"
              : "bg-muted-foreground/15 text-muted-foreground",
          )}
        >
          {trace.spoke ? "spoke" : "stayed quiet"}
        </span>
        <span className="text-muted-foreground">
          {relative(trace.startedAt)}
        </span>
        {duration !== undefined && (
          <span className="text-muted-foreground">· {duration}s</span>
        )}
      </div>

      {trace.steps.length > 0 && (
        <ol className="mt-1.5 space-y-0.5">
          {trace.steps.map((step, index) => (
            <li
              key={`${step.tool}-${index}`}
              className="flex items-baseline gap-1.5 text-xs"
            >
              <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                {step.at}ms
              </span>
              <span className={cn("shrink-0", OUTCOME_STYLE[step.outcome])}>
                {step.tool}
              </span>
              {step.outcome === "error" && (
                <span className="text-destructive">failed</span>
              )}
              {step.detail && (
                <span className="min-w-0 truncate text-muted-foreground">
                  {step.detail}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* The turn's own words. Nobody in the room can read these, so when a
          turn stayed quiet this is usually the whole explanation: the model
          answered into its own output instead of calling the tool. */}
      {!trace.spoke && trace.turnText && (
        <p className="mt-1.5 border-l-2 border-muted-foreground/30 pl-2 text-xs leading-relaxed text-muted-foreground">
          Wrote to itself: “{trace.turnText}”
        </p>
      )}

      {trace.error && (
        <p className="mt-1.5 text-xs leading-relaxed text-destructive">
          {trace.error}
        </p>
      )}
    </li>
  );
}

/**
 * What this colleague's recent turns actually did.
 *
 * "Started typing then said nothing" and "was never asked" look identical
 * from the room. This is where they stop looking identical.
 */
export function AgentTraceSection({ memberId }: { memberId: string }) {
  const traces = useTraces(memberId);

  if (!traces || traces.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        No turns recorded yet. Each time this agent is offered a message, what
        it did with the turn appears here.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {traces.map((trace) => (
        <Turn key={trace.id} trace={trace} />
      ))}
    </ul>
  );
}
