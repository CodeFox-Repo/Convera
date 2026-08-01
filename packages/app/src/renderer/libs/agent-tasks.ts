import type {
  AgentHostJobStatus,
  AgentHostTaskSummary,
} from "@/shared/types/agent-host";

const TERMINAL = new Set<AgentHostJobStatus>([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

/** What is happening now, then what is waiting, then what is being held. */
const OPEN_ORDER: AgentHostJobStatus[] = ["running", "queued", "paused"];

/**
 * What a colleague is currently carrying.
 *
 * Terminal runs are history, and a task in a DM is just "answering you right
 * now" — neither is work you would walk over and ask someone about, so neither
 * belongs in the answer to "what are you on".
 */
export function openAgentTasks(
  tasks: AgentHostTaskSummary[],
): AgentHostTaskSummary[] {
  return tasks
    .filter((task) => task.channelKind !== "dm" && !TERMINAL.has(task.status))
    .sort(
      (left, right) =>
        OPEN_ORDER.indexOf(left.status) - OPEN_ORDER.indexOf(right.status) ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.id.localeCompare(left.id),
    );
}

/** Job status in the words someone would use about a colleague. */
export function taskStatusLabel(status: string): string {
  return status === "running"
    ? "Working"
    : status === "queued"
      ? "Queued"
      : status.charAt(0).toUpperCase() + status.slice(1);
}
