/**
 * Which messages answered which — the reverse of `replyToMessageId`.
 *
 * A reply already points at its parent; standing on the parent you could not
 * see it. One pass over the transcript the renderer has already loaded, so no
 * query: the reply ids per parent, in transcript order, which is both the count
 * to show and the row to jump to.
 */
export function groupRepliesByParent(
  messages: { id: string; replyToMessageId?: string }[],
): Map<string, string[]> {
  const byParent = new Map<string, string[]>();
  for (const message of messages) {
    const parentId = message.replyToMessageId;
    // A message replying to itself would render a link to nowhere, and the
    // count would claim a thread that is one line long.
    if (!parentId || parentId === message.id) continue;
    const replies = byParent.get(parentId);
    if (replies) replies.push(message.id);
    else byParent.set(parentId, [message.id]);
  }
  return byParent;
}
