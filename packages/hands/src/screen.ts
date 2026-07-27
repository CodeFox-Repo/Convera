import { execFile } from "node:child_process";
import path from "node:path";
import robot from "@hurdlegroup/robotjs";
import { downscaleBgraToRgb, encodePng } from "./png";

/**
 * Long-edge cap the model will accept: 2576px on Opus 5 / Sonnet 5 / Opus 4.8 / 4.7,
 * 1568px on older models. On a 1728x1117 logical Mac this never binds — it is here so a
 * 6K display degrades gracefully instead of blowing the image-token budget.
 *
 * ponytail: one knob, not a per-model table. Lower it to 1568 if you target older models.
 */
export const MAX_LONG_EDGE = 2576;

export interface Shot {
  png: Buffer;
  /** Pixel dimensions of `png`. This IS the coordinate space the agent clicks in. */
  width: number;
  height: number;
  /** Device pixels per logical point. Measured per capture, never assumed. 2 on Retina. */
  scale: number;
}

/** Dimensions of the most recent screenshot, i.e. the space the agent's coordinates live in. */
let lastShot: { width: number; height: number } | null = null;

interface RawBitmap {
  width: number;
  height: number;
  byteWidth: number;
  bytesPerPixel: number;
  image: Buffer;
}

/**
 * Call the native binding directly instead of `robot.screen.capture`.
 *
 * That wrapper (`@hurdlegroup/robotjs@0.12.3` index.js:15,17) assigns to an *undeclared*
 * `b`, and the damage depends on how the caller was loaded: under CommonJS it silently
 * strands the ~30MB bitmap on globalThis every frame; in any strict-mode context — which
 * includes a `bun build --compile` binary — the same line throws "b is not defined", and
 * in a scope with a top-level `const b` it throws "Assignment to constant variable".
 *
 * The native function returns the identical fields, so skipping the wrapper removes all
 * three failure modes rather than papering over one. Nothing here needs `screen.capture`.
 */
function grabBitmap(width: number, height: number): RawBitmap {
  // An empty rect segfaults the whole process, and no JS can catch that: screengrab.c:34
  // returns NULL for an empty or fully off-screen rect, and robotjs.cc:799 dereferences it
  // without a null check. getScreenSize() reports 0x0 when there is no main display —
  // headless, display asleep or being reconfigured — so this is reachable, not theoretical.
  // A partially off-screen rect is fine; CoreGraphics clips it.
  if (width <= 0 || height <= 0) {
    throw new Error(`no display to capture (screen size reported ${width}x${height})`);
  }

  return (
    robot as unknown as {
      captureScreen(x: number, y: number, w: number, h: number): RawBitmap;
    }
  ).captureScreen(0, 0, width, height);
}

/**
 * How to re-invoke this program to take exactly one screenshot.
 *
 * Under a `bun --compile` binary there is no separate script on disk to point at, so the
 * binary answers a flag on itself. Under node every entry point (server, doctor, smoke)
 * shares the same dist directory, so they can all reach the dedicated child script.
 */
function captureCommand(): { command: string; args: string[] } {
  if (process.versions.bun) {
    return { command: process.execPath, args: ["--capture-once"] };
  }
  return { command: process.execPath, args: [path.join(__dirname, "capture-child.js")] };
}

/**
 * Capture in a short-lived child process.
 *
 * The child does the dangerous part. robotjs leaks the full frame on every call and can
 * segfault in a way no JS handler can intercept, so isolating it turns an unbounded leak
 * into memory the OS reclaims on exit, and turns a fatal crash into one failed screenshot.
 * It also makes this function genuinely asynchronous — the in-process version blocked the
 * event loop for its whole duration, which for a stdio server meant nothing else moved.
 *
 * ponytail: the price is process spawn — measured 82ms in-process vs 191ms here. Worth it
 * while robotjs owns the capture path. If it ever stops leaking, delete this and call
 * captureHere directly.
 */
export async function capture(): Promise<Shot> {
  const { command, args } = captureCommand();

  const payload = await new Promise<string>((resolve, reject) => {
    execFile(command, args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const signal = (error as NodeJS.ErrnoException & { signal?: string }).signal;
        reject(
          new Error(
            signal
              ? `screen capture crashed (${signal}); the server is still running`
              : `screen capture failed: ${stderr.trim() || error.message}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });

  const shot = JSON.parse(payload) as {
    width: number;
    height: number;
    scale: number;
    png: string;
  };

  lastShot = { width: shot.width, height: shot.height };
  return {
    png: Buffer.from(shot.png, "base64"),
    width: shot.width,
    height: shot.height,
    scale: shot.scale,
  };
}

/** The actual capture. Runs in the child; never call this from a long-lived process. */
export async function captureHere(): Promise<Shot> {
  const logical = robot.getScreenSize();
  const bitmap = grabBitmap(logical.width, logical.height);
  const scale = bitmap.width / logical.width;

  // Downscale device pixels back to logical points so the returned image's pixel
  // dimensions equal the click coordinate space. The click path then does no arithmetic.
  const longEdge = Math.max(logical.width, logical.height);
  const shrink = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1;
  const width = Math.round(logical.width * shrink);
  const height = Math.round(logical.height * shrink);

  // robotjs hands back BGRA on macOS — verified against getPixelColor, which agreed on
  // every sampled point once B and R were swapped. The channel swap rides along with the
  // downscale so the 30MB frame is walked once, not twice.
  //
  // byteWidth is passed rather than assumed: CoreGraphics pads rows to a 32-pixel
  // boundary, so it exceeds width*4 on most Mac displays. It happens to be equal on a
  // 3456-device-pixel screen, which is exactly why this was easy to get wrong.
  const rgb = downscaleBgraToRgb(
    {
      data: bitmap.image,
      stride: bitmap.byteWidth,
      width: bitmap.width,
      height: bitmap.height,
    },
    width,
    height,
  );

  lastShot = { width, height };
  return { png: encodePng(rgb, width, height), width, height, scale };
}

/**
 * Map a coordinate the agent produced (in last-screenshot pixel space) to logical points,
 * which is what robotjs input takes. Identity unless MAX_LONG_EDGE forced a shrink.
 */
export function toLogical(x: number, y: number): { x: number; y: number } {
  const logical = robot.getScreenSize();
  if (!lastShot) return clamp(x, y, logical);
  return clamp(
    (x * logical.width) / lastShot.width,
    (y * logical.height) / lastShot.height,
    logical,
  );
}

function clamp(x: number, y: number, logical: { width: number; height: number }) {
  return {
    x: Math.min(Math.max(Math.round(x), 0), logical.width - 1),
    y: Math.min(Math.max(Math.round(y), 0), logical.height - 1),
  };
}

/** Test seam: pretend a screenshot of these dimensions was the last one taken. */
export function __setLastShot(shot: { width: number; height: number } | null): void {
  lastShot = shot;
}
