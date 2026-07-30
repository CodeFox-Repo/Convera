export async function prepareThenCommit<TPrepared, TCommitted>(
  prepare: () => Promise<TPrepared>,
  commit: (prepared: TPrepared) => Promise<TCommitted>,
  rollback: (prepared: TPrepared) => Promise<void>,
): Promise<TCommitted> {
  const prepared = await prepare();
  try {
    return await commit(prepared);
  } catch (error) {
    await rollback(prepared).catch(() => {
      // Preserve the commit failure, which is the operation the user saw fail.
      // Main keeps its own durable cleanup journal for a failed compensation.
    });
    throw error;
  }
}

export async function commitThenFinalize<TCommitted, TFinalized>(
  commit: () => Promise<TCommitted>,
  finalize: (committed: TCommitted) => Promise<TFinalized>,
  rollback: (committed: TCommitted) => Promise<void>,
): Promise<TFinalized> {
  const committed = await commit();
  try {
    return await finalize(committed);
  } catch (error) {
    await rollback(committed).catch(() => {
      // Preserve the finalization failure; it is the operation the user saw.
    });
    throw error;
  }
}
