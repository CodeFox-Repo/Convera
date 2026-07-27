import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Kill switch. Create this file and every action except screenshot/context refuses. */
export const STOP_FILE = path.join(os.homedir(), ".foxy", "stop");

/**
 * Apps where a stray click is not recoverable. The wording mirrors Anthropic's
 * blast-radius labels so the refusal tells the agent *why*, not just "no".
 */
const BLAST_RADIUS = new Map<string, string>([
  ["Terminal", "equivalent to shell access"],
  ["iTerm2", "equivalent to shell access"],
  ["Warp", "equivalent to shell access"],
  ["Ghostty", "equivalent to shell access"],
  ["Alacritty", "equivalent to shell access"],
  ["Code", "equivalent to shell access via its integrated terminal"],
  ["Cursor", "equivalent to shell access via its integrated terminal"],
  ["1Password", "can read every stored credential"],
  ["Keychain Access", "can read every stored credential"],
  ["System Settings", "can change system settings"],
  ["System Preferences", "can change system settings"],
]);

let displayCount: number | null = null;

/**
 * How many displays are attached.
 *
 * This matters because the capture path can only ever see one of them: robotjs hardcodes
 * `CGMainDisplayID()` in both screengrab.c and screen.c, so a second monitor is invisible
 * to it and no argument can reach it. Telling the agent the count turns a confusing
 * absence ("where is the window they mean?") into a stated limitation.
 *
 * Cached for the process: the call costs ~150ms and display setups rarely change mid-session,
 * while `context` is supposed to be the cheap alternative to a screenshot.
 */
export function displays(): number {
  if (displayCount !== null) return displayCount;
  try {
    const out = execFileSync("system_profiler", ["SPDisplaysDataType"], {
      encoding: "utf8",
      timeout: 5000,
    });
    displayCount = Math.max(1, (out.match(/^\s*Resolution:/gm) ?? []).length);
  } catch {
    displayCount = 1;
  }
  return displayCount;
}

export function frontmost(): { app: string; bundleId: string } {
  try {
    const out = execFileSync(
      "osascript",
      [
        "-e",
        // The parentheses matter: without them AppleScript binds `whose` to the wrong term
        // and fails with -1728 on whatever process it landed on.
        'tell application "System Events" to tell (first application process whose frontmost is true) to get {name, bundle identifier}',
      ],
      { encoding: "utf8", timeout: 3000 },
    ).trim();
    const [app = "", bundleId = ""] = out.split(",").map((s) => s.trim());
    return { app, bundleId };
  } catch {
    return { app: "", bundleId: "" };
  }
}

/**
 * Returns a refusal string, or null if the action may proceed.
 *
 * ponytail: a frontmost-app deny list stops you from pointing the agent at Terminal.
 * It does nothing about a web page that renders "ignore previous instructions" — that is
 * what the untrusted-content framing on screenshot results is for. Do not mistake this
 * for injection defence.
 */
export function check(action: string): string | null {
  if (fs.existsSync(STOP_FILE)) {
    return `Refused: the kill switch is set. Delete ${STOP_FILE} to resume.`;
  }
  if (action === "screenshot") return null;
  if (process.env.FOXY_ALLOW === "all") return null;

  const { app } = frontmost();
  const radius = BLAST_RADIUS.get(app);
  if (radius) {
    return `Refused: "${app}" is the frontmost application, and controlling it is ${radius}. Ask the user to bring a different window to the front, or restart this server with FOXY_ALLOW=all if they explicitly want that.`;
  }
  return null;
}
