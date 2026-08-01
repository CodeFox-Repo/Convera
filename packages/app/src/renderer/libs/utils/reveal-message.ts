/**
 * Scroll a message row into view and flash it.
 *
 * Two callers, one behaviour: jumping to a reply's parent (already rendered)
 * and jumping to a search hit (rendered only once the conversation has
 * switched, a few frames later). Hence the wait — the row is polled for rather
 * than assumed present, so the search case does not need its own copy of this.
 *
 * The flash matters for search specifically: you land in the middle of a
 * transcript and nothing else tells you which line matched.
 */
const DEFAULT_TIMEOUT_MS = 2000;

export function revealMessage(
  messageId: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): void {
  if (typeof document === "undefined") return;

  const deadline = Date.now() + timeoutMs;

  const attempt = () => {
    // Quote-escaped rather than CSS.escape'd: this is an attribute *value*, and
    // CSS.escape is absent outside a real browser.
    const target = document.querySelector<HTMLElement>(
      `[data-message-id="${messageId.replace(/["\\]/g, "\\$&")}"]`,
    );
    if (!target) {
      if (Date.now() < deadline) requestAnimationFrame(attempt);
      return;
    }
    // The transcript scrolls itself to the bottom when a conversation's
    // messages arrive; landing a frame later leaves this scroll as the winner.
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      // The theme token, not a literal: it flips with light/dark on its own.
      target.animate?.(
        [
          {
            backgroundColor:
              "color-mix(in srgb, var(--primary) 14%, transparent)",
          },
          { backgroundColor: "transparent" },
        ],
        { duration: 1200, easing: "ease-out" },
      );
    });
  };

  attempt();
}
