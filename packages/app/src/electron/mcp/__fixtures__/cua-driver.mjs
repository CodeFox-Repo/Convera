#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "cua-driver-test", version: "1.0.0" });

server.registerTool(
  "screenshot",
  {
    description: "Capture the current screen",
    inputSchema: {
      label: z.string().optional(),
    },
  },
  async ({ label }) => ({
    content: [{ type: "text", text: label || "screen" }],
  }),
);

await server.connect(new StdioServerTransport());
