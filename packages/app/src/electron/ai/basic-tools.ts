import type { AgentSandbox } from "@/shared/types/workspace";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { AgentTool } from "./agent-tools";
import { resolveInSandbox } from "./sandbox";

/**
 * The floor every agent stands on.
 *
 * CLI providers ship their own file tools, so these exist for adapters that
 * bring none (the OpenAI API is just an HTTP endpoint). Without them an agent
 * on that provider cannot keep a memory file or read its own notes, which the
 * colleague model in CLAUDE.md assumes it can.
 *
 * Every path routes through `resolveInSandbox`: for these providers there is no
 * OS boundary, so this is the boundary.
 */

const MAX_READ_BYTES = 200_000;

function schemaOf(shape: z.ZodRawShape): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, validator] of Object.entries(shape)) {
    properties[name] = { type: "string" };
    if (!validator.isOptional()) required.push(name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

function tool(
  name: string,
  description: string,
  inputShape: z.ZodRawShape,
  execute: (input: Record<string, unknown>) => Promise<unknown>,
): AgentTool {
  const inputValidator = z.object(inputShape).passthrough();
  return {
    name,
    qualifiedName: `agent:${name}`,
    description,
    inputSchema: schemaOf(inputShape),
    inputShape,
    inputValidator,
    execute: async (input) => execute(inputValidator.parse(input)),
  };
}

export function createBasicAgentTools(sandbox: AgentSandbox): AgentTool[] {
  const at = (path: string, access: "read" | "write") =>
    resolveInSandbox(sandbox, path, access);

  return [
    tool(
      "read_file",
      "Read a UTF-8 text file from your own workspace. Paths are relative to your workspace root.",
      { path: z.string().min(1) },
      async ({ path }) => {
        const content = await readFile(at(path as string, "read"), "utf8");
        return content.length > MAX_READ_BYTES
          ? content.slice(0, MAX_READ_BYTES) + "\n[truncated]"
          : content;
      },
    ),
    tool(
      "write_file",
      "Write a UTF-8 text file in your own workspace, creating parent directories. Overwrites existing content — read first if you mean to append.",
      { path: z.string().min(1), content: z.string() },
      async ({ path, content }) => {
        const resolved = at(path as string, "write");
        await mkdir(dirname(resolved), { recursive: true });
        await writeFile(resolved, content as string, "utf8");
        return { written: path };
      },
    ),
    tool(
      "list_dir",
      "List the entries of a directory in your own workspace. Omit path for the workspace root.",
      { path: z.string().optional() },
      async ({ path }) => {
        const entries = await readdir(at((path as string) ?? ".", "read"), {
          withFileTypes: true,
        });
        return entries.map(
          (entry) => entry.name + (entry.isDirectory() ? "/" : ""),
        );
      },
    ),
  ];
}
