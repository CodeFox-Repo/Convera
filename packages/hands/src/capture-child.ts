#!/usr/bin/env node
/**
 * One capture, then exit.
 *
 * Everything about robotjs' capture path is unsafe to keep in a long-lived process:
 * it leaks the whole ~30MB frame per call (robotjs.cc never calls destroyMMBitmap), and
 * it segfaults uncatchably if CoreGraphics hands back NULL. Running it here means the
 * operating system reclaims the leak on exit, and a crash costs one screenshot instead of
 * the entire MCP server.
 *
 * Only the encoded PNG crosses the pipe — a few hundred KB, not the 30MB frame.
 */
import { captureHere } from "./screen";

captureHere()
  .then((shot) => {
    process.stdout.write(
      JSON.stringify({
        width: shot.width,
        height: shot.height,
        scale: shot.scale,
        png: shot.png.toString("base64"),
      }),
    );
  })
  .catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
