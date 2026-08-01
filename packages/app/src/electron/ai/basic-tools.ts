import type { AgentSandbox } from "@/shared/types/workspace";
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { z } from "zod";
import type { AgentTool } from "./agent-tools";
import { resolveInSandbox } from "./sandbox";
import { parseToolInput } from "./tool-input";

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
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;

function realpathIfExists(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * macOS seatbelt profile: read anywhere, write only inside the sandbox's
 * writable roots (plus tmp and /dev basics every shell needs), network per
 * the sandbox flag. Later rules win, so the allows carve out of the denies.
 */
function darwinSandboxProfile(sandbox: AgentSandbox): string {
  const writable = sandbox.writableRoots
    .map((root) => `(subpath ${JSON.stringify(realpathIfExists(root))})`)
    .join(" ");
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    `(allow file-write* ${writable}`,
    `  (subpath "/private/tmp") (subpath "/private/var/tmp")`,
    `  (subpath ${JSON.stringify(realpathIfExists(tmpdir()))})`,
    `  (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr")`,
    `  (subpath "/dev/fd") (literal "/dev/tty") (literal "/dev/dtracehelper"))`,
    ...(sandbox.networkAccess ? [] : ["(deny network*)"]),
  ].join("\n");
}

function runShell(
  sandbox: AgentSandbox,
  command: string,
  timeout: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cwd = realpathIfExists(sandbox.writableRoots[0] ?? sandbox.root);
  const [file, args] =
    process.platform === "darwin"
      ? ([
          "/usr/bin/sandbox-exec",
          ["-p", darwinSandboxProfile(sandbox), "/bin/sh", "-c", command],
        ] as const)
      : // ponytail: no OS enforcement off-macOS (cwd only); bubblewrap when Linux ships
        (["/bin/sh", ["-c", command]] as const);

  return new Promise((resolvePromise) => {
    execFile(
      file,
      [...args],
      { cwd, timeout, maxBuffer: MAX_COMMAND_OUTPUT_BYTES },
      (error, stdout, stderr) => {
        resolvePromise({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode:
            error && typeof error.code === "number"
              ? error.code
              : error
                ? 1
                : 0,
        });
      },
    );
  });
}

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
    execute: async (input) => execute(parseToolInput(inputValidator, input)),
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
    tool(
      "run_command",
      "Run a shell command inside your own workspace (git clone, build, tests). The working directory is your workspace root; writes outside it are blocked by the OS.",
      {
        command: z.string().min(1),
        timeout: z.number().min(1000).max(600_000).optional(),
      },
      async ({ command, timeout }) => {
        const result = await runShell(
          sandbox,
          command as string,
          (timeout as number | undefined) ?? 60_000,
        );
        const clip = (text: string) =>
          text.length > MAX_READ_BYTES
            ? text.slice(0, MAX_READ_BYTES) + "\n[truncated]"
            : text;
        return {
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout: clip(result.stdout),
          stderr: clip(result.stderr),
        };
      },
    ),
  ];
}
