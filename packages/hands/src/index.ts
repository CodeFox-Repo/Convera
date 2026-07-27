#!/usr/bin/env node
/**
 * stdio MCP server: hands for any MCP-capable host.
 *
 * This is the standalone entry point — `claude mcp add hands -- node dist/index.js`.
 * The same actions are exported from ./lib for hosts that run in-process instead
 * (see the agent core in packages/app), so there is one implementation, two doors.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ACTIONS, context, execute, type ComputerInput } from "./actions";
import { frontmost } from "./guard";
import { captureHere } from "./screen";

const server = new McpServer({ name: "foxy-hands", version: "0.0.0" });

server.registerTool(
  "computer",
  {
    description:
      "Control this Mac: take a screenshot, move or click the mouse, type text, press keys, scroll. " +
      "Always take a screenshot before your first action so you can see the screen, and after any " +
      "action whose result you need to confirm. Coordinates are pixels in the most recent screenshot.",
    inputSchema: {
      action: z.enum(ACTIONS).describe("The action to perform."),
      coordinate: z
        .tuple([z.number(), z.number()])
        .optional()
        .describe("[x, y] in screenshot pixels. Required for clicks, mouse_move, drag and scroll."),
      text: z
        .string()
        .optional()
        .describe('Text to type, or a key combo such as "cmd+s" or "Return", depending on action.'),
      scroll_direction: z.enum(["up", "down", "left", "right"]).optional(),
      scroll_amount: z.number().optional().describe("Scroll clicks. Defaults to 3."),
    },
  },
  async (input) => {
    const result = await execute(input as ComputerInput);
    if (!result.ok) return { content: [{ type: "text", text: result.error }], isError: true };
    if (result.kind === "screenshot") {
      return {
        content: [
          { type: "text", text: result.note },
          { type: "image", data: result.pngBase64, mimeType: "image/png" },
        ],
      };
    }
    return { content: [{ type: "text", text: result.text }] };
  },
);

server.registerTool(
  "context",
  {
    description:
      "Cheap orientation: which app is frontmost and how big the screen is, without spending " +
      "the ~1500 image tokens a screenshot costs. Call this first when you only need to know where you are.",
    inputSchema: {},
  },
  async () => {
    try {
      const { app, bundleId } = frontmost();
      return {
        content: [
          { type: "text", text: JSON.stringify({ frontmostApp: app, bundleId, ...context() }, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `context failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

async function main() {
  // A `bun --compile` binary has no separate child script on disk, so it re-invokes itself
  // with this flag to take one screenshot and exit. See captureCommand() in screen.ts.
  if (process.argv.includes("--capture-once")) {
    const shot = await captureHere();
    process.stdout.write(
      JSON.stringify({
        width: shot.width,
        height: shot.height,
        scale: shot.scale,
        png: shot.png.toString("base64"),
      }),
    );
    return;
  }

  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("foxy-hands failed to start:", error);
  process.exit(1);
});
