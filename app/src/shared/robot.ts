import type * as RobotJS from "@hurdlegroup/robotjs";
import path from "path";

/**
 * Optimized RobotJS Loader
 *
 * This module provides a robust way to load the @hurdlegroup/robotjs native module
 * with proper TypeScript support and simplified loading mechanisms.
 *
 * Key improvements:
 * - Uses TypeScript module declaration from robotjs.d.ts
 * - Simplified loading logic (only 2 paths instead of 3)
 * - Better error handling and logging
 * - Throws error when robotjs is unavailable (no fallback)
 *
 * Packaging is handled by:
 * - AutoUnpackNativesPlugin in forge.config.ts
 * - Explicit asar unpack configuration
 * - Proper electron-rebuild scripts in package.json
 */

let robotjs: typeof RobotJS;

try {
  // Try to load robotjs normally first (works in development and most packaging scenarios)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  robotjs = require("@hurdlegroup/robotjs");
  console.log("Successfully loaded robotjs from normal location");
} catch (error) {
  console.warn("Failed to load robotjs from normal location:", error);

  // Try the auto-unpack-natives standard location
  try {
    const unpackedPath = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "@hurdlegroup",
      "robotjs",
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    robotjs = require(unpackedPath);
    console.log(
      `Successfully loaded robotjs from unpacked location: ${unpackedPath}`,
    );
  } catch (unpackedError) {
    console.error("Failed to load robotjs from all locations:", unpackedError);
    throw new Error(
      "RobotJS is required but could not be loaded. Please ensure @hurdlegroup/robotjs is properly installed and compiled.",
    );
  }
}

export default robotjs;
