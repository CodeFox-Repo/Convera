import assert from "node:assert/strict";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const appRoot = process.cwd();
const variant = process.env.UX_VARIANT ?? "after";
const profileId = `ux-copy-${variant}`;
const evidenceDir = path.resolve(
  process.env.EVIDENCE_DIR ?? ".automation/ux-evidence",
);
await mkdir(evidenceDir, { recursive: true });
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);
// This verifies provider setup without credentials or billable model requests.
delete env.OPENAI_API_KEY;
delete env.FIREWORKS_API_KEY;
const transport = new StdioClientTransport({
  command: "pnpm",
  args: ["automation"],
  cwd: appRoot,
  env,
  stderr: "pipe",
});
const client = new Client({
  name: "convera-ux-verification",
  version: "1.0.0",
});
const log: unknown[] = [];
async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args }, undefined, {
    timeout: 120000,
  });
  const blocks = result.content as Array<{ type: string; text?: string }>;
  const body = blocks.find((block) => block.type === "text")?.text;
  const parsed = body ? JSON.parse(body) : null;
  log.push({ name, args, result: parsed });
  await writeFile(
    path.join(evidenceDir, `${variant}-automation.json`),
    JSON.stringify(log, null, 2),
  );
  assert.ok(!result.isError && parsed?.ok, JSON.stringify(parsed));
  return parsed.data;
}
async function capture(name: string) {
  const shot = await call("convera_observe", { action: "screenshot" });
  await copyFile(
    shot.filePath,
    path.join(evidenceDir, `${variant}-${name}.png`),
  );
}
async function find(name: string) {
  const elements = await call("convera_observe", {
    action: "snapshot",
    max_elements: 500,
  });
  const element = elements.find((item: { name: string }) => item.name === name);
  assert.ok(element, `Missing visible control: ${name}`);
  return element.selector as string;
}
let launched = false;
try {
  await client.connect(transport);
  await call("convera_session", { action: "launch", profile_id: profileId });
  launched = true;
  await call("convera_observe", { action: "snapshot", max_elements: 500 });
  await call("convera_wait", {
    condition: "displayed",
    selector: 'button[aria-label="Open settings"]',
    timeout_ms: 60000,
  });
  await call("convera_observe", { action: "snapshot", max_elements: 500 });
  await capture("workspace");
  await call("convera_interact", {
    action: "click",
    selector: await find("Open settings"),
  });
  await call("convera_wait", {
    condition: "exists",
    selector: '[data-testid="local-ai-provider-openai-api"]',
    timeout_ms: 60000,
  });
  const providerSelector = '[data-testid="local-ai-provider-openai-api"]';
  await call("convera_wait", {
    condition: "text_contains",
    selector: providerSelector,
    text: "No API key",
    timeout_ms: 60000,
  });
  await call("convera_interact", {
    action: "scroll",
    selector: providerSelector,
  });
  const provider = await call("convera_observe", {
    action: "element",
    selector: providerSelector,
  });
  assert.equal(provider.enabled, false);
  if (variant === "after")
    assert.match(provider.text, /Set OPENAI_API_KEY.*restart Convera/);
  await capture("provider-settings");
  const refreshSelector = await find("Re-check providers");
  await call("convera_interact", {
    action: "click",
    selector: refreshSelector,
  });
  await call("convera_wait", {
    condition: "enabled",
    selector: refreshSelector,
    timeout_ms: 60000,
  });
  await call("convera_wait", {
    condition: "text_contains",
    selector: providerSelector,
    text: "No API key",
    timeout_ms: 60000,
  });
  const memorySelector = await find("Background curator");
  await call("convera_interact", {
    action: "scroll",
    selector: memorySelector,
  });
  const body = await call("convera_observe", {
    action: "element",
    selector: "body",
  });
  if (variant === "after")
    assert.match(body.text, /completed turns are sent|Sends completed turns/);
  await capture("memory-settings");
  // Leave settings and return without changing any provider or memory choice.
  const snapshot = await call("convera_observe", {
    action: "snapshot",
    max_elements: 500,
  });
  const back = snapshot.find((item: { name: string }) =>
    /back to (workspace|chat)/i.test(item.name),
  );
  if (back) {
    await call("convera_interact", {
      action: "click",
      selector: back.selector,
    });
    await call("convera_observe", { action: "snapshot", max_elements: 500 });
  }
} catch (error) {
  if (launched) {
    // Keep diagnostic evidence without turning a failed assertion into success.
    for (const action of ["snapshot", "logs"] as const) {
      try {
        await call("convera_observe", { action, max_elements: 500 });
      } catch (diagnosticError) {
        log.push({ diagnosticError: String(diagnosticError) });
      }
    }
    try {
      await capture("failure");
    } catch (diagnosticError) {
      log.push({ diagnosticError: String(diagnosticError) });
    }
  }
  throw error;
} finally {
  try {
    if (launched) await call("convera_session", { action: "close" });
  } finally {
    await client.close();
  }
  await rm(path.join(appRoot, ".automation", "profiles", profileId), {
    recursive: true,
    force: true,
  });
}
