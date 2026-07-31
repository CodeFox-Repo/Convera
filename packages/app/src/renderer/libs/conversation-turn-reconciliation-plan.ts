import type { LocalAITurnRuntimeState } from "@/shared/types/local-ai";
import type { PendingTurnJournal } from "./db/database";

export const TURN_NOT_FOUND_GRACE_MS = 5_000;
export const LIVE_FINALIZER_GRACE_MS = 5_000;

export type TurnReconciliationAction =
  | "defer"
  | "rollback"
  | "pending"
  | "complete"
  | "fail"
  | "restore"
  | "cleanup";

export function planTurnReconciliation(
  journal: PendingTurnJournal,
  runtime: LocalAITurnRuntimeState | null,
  options: {
    now: number;
    stableNotFound: boolean;
    preferLiveGrace?: boolean;
    liveAvailable?: boolean;
  },
): TurnReconciliationAction {
  if (!runtime) {
    const journalAge = options.now - journal.createdAt.getTime();
    return options.stableNotFound || journalAge >= TURN_NOT_FOUND_GRACE_MS
      ? "rollback"
      : "defer";
  }
  if (runtime.rendererPersistedAt) return "cleanup";
  if (runtime.status === "pending") return "pending";
  const completedAt = runtime.completedAt
    ? new Date(runtime.completedAt).getTime()
    : undefined;
  if (
    options.preferLiveGrace &&
    !options.liveAvailable &&
    journal.state !== "committed-awaiting-ack" &&
    completedAt !== undefined &&
    options.now - completedAt < LIVE_FINALIZER_GRACE_MS
  ) {
    return "defer";
  }
  if (runtime.status === "completed") {
    return "complete";
  }
  if (
    journal.operation === "rebase" &&
    (journal.operationReason === "edit" ||
      journal.operationReason === "regenerate")
  ) {
    return "restore";
  }
  return "fail";
}
