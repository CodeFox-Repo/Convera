#!/usr/bin/env node
/**
 * Smoke test: speak real MCP to a real server process, with no model in the loop.
 *
 * This exists because the model-in-the-loop test lies. Asking Claude to "take a screenshot
 * and describe it" produced a fluent, accurate description of the screen while the hands
 * server was not loaded at all — it had quietly fallen back to another capability. The
 * output looked like success. Only a protocol-level client can tell you whether *this*
 * server answered, and it does it in 200ms instead of 40 seconds of billed tokens.
 *
 *   node dist/smoke.js                      # test the node build
 *   node dist/smoke.js ./foxy-hands         # test a bun --compile binary
 *   node dist/smoke.js --write              # also exercise an action that moves the mouse
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import robot from "@hurdlegroup/robotjs";
import path from "node:path";

interface Block {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}
interface ToolResult {
  content: Block[];
  isError?: boolean;
}

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
}

/** PNG dimensions live in the IHDR chunk at a fixed offset — no image library needed. */
function pngSize(png: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 24 || !png.subarray(0, 8).equals(signature)) return null;
  if (png.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const target = args.find((a) => !a.startsWith("--"));

  const command = target ? path.resolve(target) : process.execPath;
  const commandArgs = target ? [] : [path.join(__dirname, "index.js")];
  console.log(`server: ${command} ${commandArgs.join(" ")}`);

  const started = Date.now();
  const client = new Client({ name: "hands-smoke", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command, args: commandArgs }));
  check("server handshakes", true, `${Date.now() - started}ms`);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  check("exposes exactly [computer, context]", JSON.stringify(names) === '["computer","context"]', names.join(","));

  const ctx = (await client.callTool({ name: "context", arguments: {} })) as ToolResult;
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(ctx.content[0]?.text ?? "{}");
  } catch {
    /* leaves parsed empty, asserted below */
  }
  check("context returns JSON with a frontmost app", typeof parsed.frontmostApp === "string", String(parsed.frontmostApp));

  const shot = (await client.callTool({
    name: "computer",
    arguments: { action: "screenshot" },
  })) as ToolResult;

  check("screenshot did not error", !shot.isError, shot.isError ? shot.content[0]?.text ?? "" : "");

  const note = shot.content.find((b) => b.type === "text")?.text ?? "";
  const image = shot.content.find((b) => b.type === "image");
  check("screenshot returns an image block", image?.mimeType === "image/png");

  // The screenshot result is model-facing input from an untrusted surface. If this framing
  // ever goes missing, a web page rendering "ignore your previous instructions" starts
  // reading like a user instruction, so it is a test and not a nicety.
  check("screenshot frames screen content as untrusted", /untrusted/i.test(note));

  const png = image?.data ? Buffer.from(image.data, "base64") : Buffer.alloc(0);
  const size = pngSize(png);
  const screen = robot.getScreenSize();
  check("image is a decodable PNG", size !== null, size ? `${size.width}x${size.height}` : "");

  // The whole coordinate contract: the returned image's pixels ARE the click space.
  check(
    "image dimensions equal the logical screen",
    size?.width === screen.width && size?.height === screen.height,
    `screen ${screen.width}x${screen.height}`,
  );

  const bogus = (await client.callTool({
    name: "computer",
    arguments: { action: "left_click", coordinate: [999999, 999999] },
  })) as ToolResult;
  check("out-of-range coordinate is handled, not thrown", Array.isArray(bogus.content));

  // A tool that throws kills the stdio session and the host loses the server entirely,
  // so the server has to still be alive after the worst input we can give it.
  const after = (await client.callTool({ name: "context", arguments: {} })) as ToolResult;
  check("server still alive after a bad call", !after.isError);

  if (write) {
    const before = robot.getMousePos();
    const target = { x: before.x + 9, y: before.y + 9 };
    const moved = (await client.callTool({
      name: "computer",
      arguments: { action: "mouse_move", coordinate: [target.x, target.y] },
    })) as ToolResult;
    const now = robot.getMousePos();
    robot.moveMouse(before.x, before.y);

    // A refusal here is the guard doing its job, not a failure — whether it fires depends
    // on which window happens to be focused when the harness runs. Asserting "the cursor
    // moved" unconditionally would make this test go red for the correct behaviour.
    const refusal = moved.isError ? (moved.content[0]?.text ?? "") : "";
    if (/^Refused:/.test(refusal)) {
      check("guard refused a write action, and said why", /frontmost|kill switch/.test(refusal), refusal.slice(0, 60));
      // Not "the cursor never moved" — a human hand on the same trackpad makes that flaky.
      // The property that matters is that the refused move did not happen.
      check("cursor is not at the refused target", !(now.x === target.x && now.y === target.y));
    } else {
      check("mouse_move actually moved the cursor", !moved.isError && now.x === target.x && now.y === target.y);
    }
  } else {
    console.log("  – write actions skipped (pass --write to include them)");
  }

  await client.close();
  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}  ${Date.now() - started}ms total`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("smoke harness crashed:", error);
  process.exit(1);
});
