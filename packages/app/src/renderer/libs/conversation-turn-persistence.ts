interface PendingTurn {
  conversationId: string;
  promise: Promise<void>;
  resolve: () => void;
}

const pendingTurns = new Map<string, PendingTurn>();

/**
 * Registers the renderer persistence half of a turn before startChat crosses
 * the IPC boundary. Conversation deletion can then wait until the terminal
 * transcript commit has completed.
 */
export function registerConversationTurnPersistence(
  conversationId: string,
  turnId: string,
): void {
  if (pendingTurns.has(turnId)) return;
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = () => done();
  });
  pendingTurns.set(turnId, { conversationId, promise, resolve });
}

export function completeConversationTurnPersistence(turnId: string): void {
  const pending = pendingTurns.get(turnId);
  if (!pending) return;
  pendingTurns.delete(turnId);
  pending.resolve();
}

export function getPendingConversationTurnIds(
  conversationId: string,
): string[] {
  return [...pendingTurns.entries()]
    .filter(([, pending]) => pending.conversationId === conversationId)
    .map(([turnId]) => turnId);
}

export async function waitForConversationTurnPersistence(
  conversationId: string,
): Promise<void> {
  while (true) {
    const promises = [...pendingTurns.values()]
      .filter((pending) => pending.conversationId === conversationId)
      .map((pending) => pending.promise);
    if (promises.length === 0) return;
    await Promise.all(promises);
  }
}
