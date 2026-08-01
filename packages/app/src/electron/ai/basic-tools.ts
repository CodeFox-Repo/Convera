import type { AgentSandbox } from "@/shared/types/workspace";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { z } from "zod";
import { shapeForSchema, type AgentTool } from "./agent-tools";
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

// Pi's grep/find download rg/fd from GitHub into ~/.pi/bin when missing —
// a network fetch and an executable write outside every sandbox boundary
// this file enforces. PI_OFFLINE makes ensureTool use system binaries or
// fail cleanly ("ripgrep is not available") instead of downloading.
process.env.PI_OFFLINE ??= "1";

/**
 * pi-coding-agent is ESM-only (no `require` condition in its export map).
 * A static import compiles to require() in CJS execution contexts — tsx
 * running the dev web bridge — and crashes at load. Dynamic import() stays
 * an ESM import everywhere, so pi loads lazily and is cached.
 */
const piToolFactories = import("@earendil-works/pi-coding-agent");

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
  prepareArguments?(args: unknown): unknown;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; text?: string }> }>;
}

function toPiTool(tool: unknown): PiTool {
  return tool as PiTool;
}

/**
 * Pi returns MCP-style content blocks; agents consume plain text. Non-text
 * blocks (images from the read tool) are named rather than silently dropped —
 * an agent told "Read image file" with nothing attached would reason about a
 * screenshot it cannot see.
 */
function textOf(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  const parts = result.content.map((block) =>
    block.type === "text" && block.text
      ? block.text
      : `[${block.type} content not supported by this tool]`,
  );
  return parts.join("\n");
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
  // Real types from pi's JSON Schema, not z.unknown(): the model needs the
  // per-field descriptions (offset is 1-indexed, the edits[] contract), and
  // a wrong-typed path must be rejected here with a message the model can
  // act on, not deep inside pi as "normalized.replace is not a function".
  const shape = shapeForSchema(pi.parameters);
  const inputValidator = z.object(shape).passthrough();

  return {
    name,
    qualifiedName: `agent:${name}`,
    description: pi.description,
    inputSchema: pi.parameters,
    inputShape: shape,
    inputValidator,
    execute: async (input) => {
      // Pi's own repair hook first (edit ships one that accepts edits sent
      // as a JSON string or as legacy flat oldText/newText), then validate.
      const repaired = pi.prepareArguments
        ? (pi.prepareArguments(input) as Record<string, unknown>)
        : input;
      const parsed = parseToolInput(inputValidator, repaired);
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

export async function createBasicAgentTools(
  sandbox: AgentSandbox,
): Promise<AgentTool[]> {
  const cwd = sandbox.root;
  const pi = await piToolFactories;

  return [
    sandboxedPiTool(
      sandbox,
      toPiTool(pi.createReadTool(cwd)),
      "read_file",
      "read",
    ),
    sandboxedPiTool(
      sandbox,
      toPiTool(pi.createWriteTool(cwd)),
      "write_file",
      "write",
    ),
    sandboxedPiTool(
      sandbox,
      toPiTool(pi.createEditTool(cwd)),
      "edit_file",
      "write",
    ),
    sandboxedPiTool(sandbox, toPiTool(pi.createGrepTool(cwd)), "grep", "read"),
    sandboxedPiTool(sandbox, toPiTool(pi.createFindTool(cwd)), "find", "read"),
    sandboxedPiTool(
      sandbox,
      toPiTool(pi.createLsTool(cwd)),
      "list_dir",
      "read",
    ),
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
