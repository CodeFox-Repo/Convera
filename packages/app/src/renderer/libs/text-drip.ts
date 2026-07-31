/**
 * Smooths bursty stream text into a steady character drip.
 *
 * The CLI providers do not emit token-by-token: a measured Claude Code reply
 * delivered 412 characters in 5 chunks of ~100, ~220ms apart. Rendered as they
 * arrive that reads as five paste events, not typing. This buffers arrivals and
 * releases characters on animation frames instead.
 *
 * Rate adapts to the backlog so the drip never falls behind the stream: a big
 * buffer drains faster, and `flush()` (on finish/abort) emits the rest at once.
 */
export interface TextDrip {
  /** Queue newly arrived text. */
  push(text: string): void;
  /** Emit everything still buffered immediately and stop. */
  flush(): void;
  /** Stop without emitting the remainder. */
  cancel(): void;
}

export interface TextDripOptions {
  /** Receives text to append, in render-sized pieces. */
  onText(text: string): void;
  /** Baseline characters per second. */
  charsPerSecond?: number;
  /** Buffer beyond this many chars drains proportionally faster. */
  comfortableBacklog?: number;
  /** Injectable for tests; defaults to requestAnimationFrame. */
  scheduler?: (callback: (time: number) => void) => number;
  cancelScheduled?: (handle: number) => void;
}

const DEFAULT_CHARS_PER_SECOND = 420;
const DEFAULT_COMFORTABLE_BACKLOG = 120;

export function createTextDrip(options: TextDripOptions): TextDrip {
  const baseRate = options.charsPerSecond ?? DEFAULT_CHARS_PER_SECOND;
  const comfortable = options.comfortableBacklog ?? DEFAULT_COMFORTABLE_BACKLOG;
  // rAF paces to the display when there is one; the timer fallback keeps this
  // usable outside a browser (tests, SSR) instead of throwing.
  const hasRAF = typeof requestAnimationFrame === "function";
  const schedule =
    options.scheduler ??
    (hasRAF
      ? (callback) => requestAnimationFrame(callback) as unknown as number
      : (callback) =>
          setTimeout(() => callback(Date.now()), 16) as unknown as number);
  const unschedule =
    options.cancelScheduled ??
    (hasRAF
      ? (handle) => cancelAnimationFrame(handle)
      : (handle) => clearTimeout(handle));

  let buffer = "";
  let handle: number | undefined;
  let lastTime: number | undefined;
  let stopped = false;

  const stop = () => {
    if (handle !== undefined) unschedule(handle);
    handle = undefined;
    lastTime = undefined;
  };

  const tick = (time: number) => {
    handle = undefined;
    if (stopped) return;

    const elapsed = lastTime === undefined ? 0 : time - lastTime;
    lastTime = time;

    // Drain faster the further behind we are, so a long reply never lags.
    const catchUp = Math.max(1, buffer.length / comfortable);
    const allowed = Math.max(
      1,
      Math.floor((elapsed / 1000) * baseRate * catchUp),
    );

    const piece = buffer.slice(0, allowed);
    buffer = buffer.slice(allowed);
    if (piece) options.onText(piece);

    if (buffer) handle = schedule(tick);
    else lastTime = undefined;
  };

  return {
    push(text) {
      if (stopped || !text) return;
      buffer += text;
      if (handle === undefined) handle = schedule(tick);
    },
    flush() {
      if (stopped) return;
      stopped = true;
      stop();
      if (buffer) {
        const remainder = buffer;
        buffer = "";
        options.onText(remainder);
      }
    },
    cancel() {
      stopped = true;
      buffer = "";
      stop();
    },
  };
}
