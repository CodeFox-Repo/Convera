import type { AgentSandbox } from "@/shared/types/workspace";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import {
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
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
 * The tool implementations come from pi-coding-agent — offset/limit reads,
 * structured edits, grep/find/ls — but pi deliberately ships no sandbox, so
 * every path canonicalizes through `resolveInSandbox` before pi sees it, and
 * bash is replaced by our ASRT-wrapped shell. Pi supplies the hands; the
 * boundary stays ours.
 */

const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;

function realpathIfExists(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * OS enforcement via Anthropic's sandbox runtime (seatbelt on macOS,
 * bubblewrap+seccomp on Linux). The manager is a process-wide singleton:
 * per-agent filesystem policy goes through the per-call config, but the
 * network proxy applies one policy to every wrapped command. Initialized on
 * first use so sessions that never run a command never start proxy servers.
 *
 * Network policy: open by default — a colleague clones repos and installs
 * dependencies; the filesystem boundary is the guarantee. A sandbox with
 * `networkAccess: false` is honoured through the ask-callback below, which
 * fails closed for everyone while any such command is running. That over-
 * denies concurrent network-enabled commands for a moment, which is the
 * right direction to be wrong in.
 */
let sandboxRuntimeReady: Promise<boolean> | null = null;
let denyNetworkCommands = 0;

function ensureSandboxRuntime(): Promise<boolean> {
  sandboxRuntimeReady ??= (async () => {
    if (!SandboxManager.isSupportedPlatform()) return false;
    try {
      await SandboxManager.initialize(
        {
          network: { allowedDomains: [], deniedDomains: [] },
          filesystem: { denyRead: [], allowWrite: [], denyWrite: [] },
        },
        async () => denyNetworkCommands === 0,
      );
      return true;
    } catch {
      return false;
    }
  })();
  return sandboxRuntimeReady;
}

async function runShell(
  sandbox: AgentSandbox,
  command: string,
  timeout: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cwd = realpathIfExists(sandbox.writableRoots[0] ?? sandbox.root);

  let file = "/bin/sh";
  let args = ["-c", command];
  let env = process.env;
  if (await ensureSandboxRuntime()) {
    const wrapped = await SandboxManager.wrapWithSandboxArgv(
      command,
      undefined,
      {
        filesystem: {
          denyRead: [],
          allowWrite: sandbox.writableRoots.map(realpathIfExists),
          denyWrite: [],
        },
      },
      undefined,
      cwd,
    );
    [file, ...args] = wrapped.argv;
    env = { ...process.env, ...wrapped.env };
  }
  // ponytail: unsupported platform / failed init runs unsandboxed in cwd —
  // matches pre-ASRT behaviour off-macOS; revisit if that ever ships.

  if (!sandbox.networkAccess) denyNetworkCommands += 1;
  try {
    return await new Promise((resolvePromise) => {
      execFile(
        file,
        args,
        { cwd, env, timeout, maxBuffer: MAX_COMMAND_OUTPUT_BYTES },
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
  } finally {
    if (!sandbox.networkAccess) denyNetworkCommands -= 1;
  }
}

/**
 * The subset of a pi tool this adapter relies on. Pi's own AgentTool types
 * its schema as TypeBox `TSchema` and its params as `Static<T>`; this view
 * flattens both to plain records, so casts go through `toPiTool`.
 */
interface PiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown> & {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; text?: string }> }>;
}

function toPiTool(tool: unknown): PiTool {
  return tool as PiTool;
}

/** Pi returns MCP-style content blocks; agents consume plain text. */
function textOf(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return result.content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
}

/**
 * Wraps a pi tool as an AgentTool with its `path` argument canonicalized
 * through the sandbox. Pi's cwd only resolves relative paths — it does not
 * confine absolute ones, so the confinement must happen here.
 */
function sandboxedPiTool(
  sandbox: AgentSandbox,
  pi: PiTool,
  name: string,
  access: "read" | "write",
): AgentTool {
  const shape: z.ZodRawShape = {};
  const required = new Set(pi.parameters.required ?? []);
  for (const property of Object.keys(pi.parameters.properties ?? {})) {
    const base = z.unknown();
    shape[property] = required.has(property) ? base : base.optional();
  }
  const inputValidator = z.object(shape).passthrough();

  return {
    name,
    qualifiedName: `agent:${name}`,
    description: pi.description,
    inputSchema: pi.parameters,
    inputShape: shape,
    inputValidator,
    execute: async (input) => {
      const parsed = parseToolInput(inputValidator, input);
      if (typeof parsed.path === "string") {
        parsed.path = resolveInSandbox(sandbox, parsed.path, access);
      } else if (parsed.path === undefined && access === "read") {
        // grep/find/ls default to cwd; pin that default inside the sandbox.
        parsed.path = sandbox.root;
      }
      const result = await pi.execute(
        `agent-${name}-${Date.now()}`,
        parsed as Record<string, unknown>,
      );
      return textOf(result);
    },
  };
}

export function createBasicAgentTools(sandbox: AgentSandbox): AgentTool[] {
  const cwd = sandbox.root;

  return [
    sandboxedPiTool(
      sandbox,
      toPiTool(createReadTool(cwd)),
      "read_file",
      "read",
    ),
    sandboxedPiTool(
      sandbox,
      toPiTool(createWriteTool(cwd)),
      "write_file",
      "write",
    ),
    sandboxedPiTool(
      sandbox,
      toPiTool(createEditTool(cwd)),
      "edit_file",
      "write",
    ),
    sandboxedPiTool(sandbox, toPiTool(createGrepTool(cwd)), "grep", "read"),
    sandboxedPiTool(sandbox, toPiTool(createFindTool(cwd)), "find", "read"),
    sandboxedPiTool(sandbox, toPiTool(createLsTool(cwd)), "list_dir", "read"),
    {
      name: "run_command",
      qualifiedName: "agent:run_command",
      description:
        "Run a shell command inside your own workspace (git clone, build, tests). The working directory is your workspace root; writes outside it are blocked by the OS.",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string" },
          timeout: { type: "number" },
        },
        required: ["command"],
        additionalProperties: false,
      },
      inputShape: {
        command: z.string().min(1),
        timeout: z.number().min(1000).max(600_000).optional(),
      },
      inputValidator: z
        .object({
          command: z.string().min(1),
          timeout: z.number().min(1000).max(600_000).optional(),
        })
        .passthrough(),
      execute: async (input) => {
        const parsed = parseToolInput(
          z
            .object({
              command: z.string().min(1),
              timeout: z.number().min(1000).max(600_000).optional(),
            })
            .passthrough(),
          input,
        );
        const result = await runShell(
          sandbox,
          parsed.command as string,
          (parsed.timeout as number | undefined) ?? 60_000,
        );
        const clip = (text: string) =>
          text.length > 200_000
            ? text.slice(0, 200_000) + "\n[truncated]"
            : text;
        return {
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout: clip(result.stdout),
          stderr: clip(result.stderr),
        };
      },
    },
  ];
}
