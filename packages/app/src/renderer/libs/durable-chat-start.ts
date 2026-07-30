/**
 * Keeps the crash boundary explicit: the outgoing renderer transcript must be
 * durable before Electron main is allowed to accept provider work.
 */
export async function persistBeforeStartChat<T>(
  persist: () => Promise<void>,
  startChat: () => Promise<T>,
): Promise<T> {
  await persist();
  return startChat();
}
