export interface DurableTranscriptEntry {
  id: string;
  role: string;
  content: string;
  turnId?: string;
  status?: string;
}

interface PendingTurnIdentifiers {
  turnId: string;
  userMessageId?: string;
  /**
   * Absent when the turn is not expected to produce a reply at all — an agent
   * offered the floor that decides it has nothing to add says nothing, and a
   * colleague who stays quiet should leave no trace to clean up afterwards.
   *
   * This is deliberately a separate state from "the shell went missing", which
   * still throws: a lost shell means a turn that WAS going to speak lost its
   * row, and silently tolerating that would hide transcript corruption.
   */
  assistantMessageId?: string;
}

export function assertPendingTurnCanStage(
  current: DurableTranscriptEntry[],
  expected: DurableTranscriptEntry[],
): void {
  if (current.some((message) => message.status === "pending")) {
    throw new Error(
      "Conversation already has an outgoing turn awaiting completion.",
    );
  }

  const visibleCurrent = current.filter((message) => message.role !== "tool");
  const unchanged =
    visibleCurrent.length === expected.length &&
    visibleCurrent.every((message, index) => {
      const candidate = expected[index];
      return (
        candidate !== undefined &&
        message.id === candidate.id &&
        message.role === candidate.role &&
        message.content === candidate.content
      );
    });
  if (!unchanged) {
    throw new Error(
      "Conversation changed before the outgoing turn could be staged.",
    );
  }
}

export function selectPendingTurnMessages<T extends DurableTranscriptEntry>(
  messages: T[],
  turn: PendingTurnIdentifiers,
): T[] {
  const selectedIds = new Set(
    [turn.userMessageId, turn.assistantMessageId].filter(
      (messageId): messageId is string => messageId !== undefined,
    ),
  );
  const selected = messages.filter((message) => selectedIds.has(message.id));
  const selectedById = new Map(
    selected.map((message) => [message.id, message]),
  );
  if (turn.assistantMessageId && !selectedById.has(turn.assistantMessageId)) {
    throw new Error("The pending assistant shell is missing.");
  }
  if (turn.userMessageId && !selectedById.has(turn.userMessageId)) {
    throw new Error("The outgoing user message is missing.");
  }
  return selected;
}
