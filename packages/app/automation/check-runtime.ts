import { assertSupportedAutomationNodeVersion } from "./runtime.js";

try {
  assertSupportedAutomationNodeVersion();
} catch (error) {
  console.error(
    "Cannot prepare Electron automation:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
}
