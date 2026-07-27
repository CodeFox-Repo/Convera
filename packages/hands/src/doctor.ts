#!/usr/bin/env node
/**
 * Are the two macOS grants actually in place for *this* process?
 *
 * They are separate: Screen Recording governs capture, Accessibility governs synthetic input.
 * robotjs fails SILENTLY on macOS without Accessibility — no throw, no return value — so the
 * only honest check is to move the cursor and read it back.
 *
 * TCC attributes the grant to the app that launched this process, not to the `node` binary.
 * Run this the same way the MCP host will run the server, or the answer means nothing.
 */
import robot from "@hurdlegroup/robotjs";
import { capture } from "./screen";
import { frontmost, STOP_FILE } from "./guard";
import fs from "node:fs";

const SETTINGS = {
  screen:
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  input: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
};

async function main() {
  const size = robot.getScreenSize();
  console.log(`screen (logical): ${size.width}x${size.height}`);

  const before = robot.getMousePos();
  robot.moveMouse(before.x + 7, before.y + 7);
  await new Promise((r) => setTimeout(r, 120));
  const after = robot.getMousePos();
  robot.moveMouse(before.x, before.y);
  const inputWorks = after.x !== before.x || after.y !== before.y;

  let captureWorks = false;
  let shotInfo = "";
  try {
    const shot = await capture();
    captureWorks = shot.png.length > 0;
    shotInfo = `${shot.width}x${shot.height} px, device scale ${shot.scale}, ${shot.png.length} bytes png`;
  } catch (error) {
    shotInfo = error instanceof Error ? error.message : String(error);
  }

  console.log(`Accessibility (input)   : ${inputWorks ? "OK" : "BLOCKED"}`);
  if (!inputWorks) console.log(`  grant it here → ${SETTINGS.input}`);
  console.log(`Screen Recording (capture): ${captureWorks ? "OK" : "BLOCKED"}  ${shotInfo}`);
  if (!captureWorks) console.log(`  grant it here → ${SETTINGS.screen}`);
  console.log(`frontmost app           : ${frontmost().app || "(unknown — grant Automation)"}`);
  console.log(`kill switch             : ${fs.existsSync(STOP_FILE) ? `SET (${STOP_FILE})` : "clear"}`);

  if (!inputWorks || !captureWorks) {
    console.log("\nA newly granted permission usually needs the launching app restarted.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
