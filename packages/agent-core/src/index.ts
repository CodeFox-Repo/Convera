import { execFileSync } from "node:child_process";
import {
  createSdkMcpServer,
  query,
  tool,
  type CanUseTool,
  type Options,
  type PermissionResult,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { ACTIONS, context, execute, frontmost, type ComputerInput } from "@convera/hands";
import { z } from "zod";

/** Actions that only read. Everything else moves the user's mouse or keyboard. */
const READ_ONLY = new Set(["screenshot"]);

export interface ApprovalRequest {
  action: string;
  /** Human-readable summary, already resolved to app names — safe to show verbatim. */
  summary: string;
  frontmostApp: string;
  input: ComputerInput;
}

export interface AgentCoreOptions {
  /**
   * Gate for anything that touches the mouse or keyboard. Resolve false to deny.
   *
   * Omitting this denies every write action. That default is deliberate: a headless
   * caller that forgot to wire an approval UI should do nothing, not everything.
   */
  approve?: (request: ApprovalRequest) => Promise<boolean>;
  model?: string;
  systemPrompt?: string;
  maxTurns?: number;
  cwd?: string;
  abortController?: AbortController;
  /** Override the Claude Code binary. Defaults to the user's own install if present. */
  claudeExecutable?: string;
}

/**
 * Prefer the `claude` the user already has over the per-platform binary the SDK ships
 * (~245MB on darwin-arm64). Returns undefined when there is none, which makes the SDK
 * fall back to its bundled copy.
 */
export function resolveClaudeExecutable(): string | undefined {
  try {
    const found = execFileSync("which", ["claude"], { encoding: "utf8" }).trim();
    return found || undefined;
  } catch {
    return undefined;
  }
}

function describe(input: ComputerInput, app: string): string {
  const where = input.coordinate ? ` at (${input.coordinate[0]}, ${input.coordinate[1]})` : "";
  switch (input.action) {
    case "type":
      return `type ${JSON.stringify(input.text ?? "")} into ${app}`;
    case "key":
      return `press ${input.text} in ${app}`;
    case "scroll":
      return `scroll ${input.scroll_direction ?? "down"} in ${app}`;
    default:
      return `${input.action.replace(/_/g, " ")}${where} in ${app}`;
  }
}

function desktopServer() {
  const computer = tool(
    "computer",
    "Control this Mac: screenshot, move or click the mouse, type text, press keys, scroll. " +
      "Take a screenshot before your first action, and after any action whose result you need " +
      "to confirm. Coordinates are pixels in the most recent screenshot.",
    {
      action: z.enum(ACTIONS),
      coordinate: z.tuple([z.number(), z.number()]).optional(),
      text: z.string().optional(),
      scroll_direction: z.enum(["up", "down", "left", "right"]).optional(),
      scroll_amount: z.number().optional(),
    },
    async (args) => {
      const result = await execute(args as ComputerInput);
      if (!result.ok) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      if (result.kind === "screenshot") {
        return {
          content: [
            { type: "text" as const, text: result.note },
            { type: "image" as const, data: result.pngBase64, mimeType: "image/png" },
          ],
        };
      }
      return { content: [{ type: "text" as const, text: result.text }] };
    },
  );

  const whereAmI = tool(
    "context",
    "Cheap orientation: frontmost app and screen size, without spending the image tokens a " +
      "screenshot costs.",
    {},
    async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ frontmostApp: frontmost().app, ...context() }, null, 2),
        },
      ],
    }),
  );

  return createSdkMcpServer({ name: "desktop", version: "0.0.0", tools: [computer, whereAmI] });
}

const COMPUTER_TOOL = "mcp__desktop__computer";

function permissionGate(approve: AgentCoreOptions["approve"]): CanUseTool {
  return async (toolName, input): Promise<PermissionResult> => {
    if (toolName !== COMPUTER_TOOL) return { behavior: "allow", updatedInput: input };

    const typed = input as unknown as ComputerInput;
    if (READ_ONLY.has(typed.action)) return { behavior: "allow", updatedInput: input };

    if (!approve) {
      return {
        behavior: "deny",
        message:
          "No approval handler is wired up, so actions that move the mouse or keyboard are refused.",
      };
    }

    const app = frontmost().app || "the frontmost app";
    const granted = await approve({
      action: typed.action,
      summary: describe(typed, app),
      frontmostApp: app,
      input: typed,
    });

    return granted
      ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: "The user declined this action." };
  };
}

export function run(prompt: string, opts: AgentCoreOptions = {}): AsyncGenerator<SDKMessage> {
  const options: Options = {
    mcpServers: { desktop: desktopServer() },

    // Never list the computer tool in `allowedTools`. A bare name there auto-approves the
    // call *before* canUseTool runs — measured: the callback was never invoked and the SDK
    // warned CLAUDE_SDK_CAN_USE_TOOL_SHADOWED. The approval gate below is the whole point,
    // so the allowlist stays empty.
    canUseTool: permissionGate(opts.approve),

    // Do not inherit the user's own Claude Code environment. Without these the session
    // picks up their personal MCP servers and settings — measured: unrelated servers from
    // ~/.claude showed up in the tool list on the first spike.
    strictMcpConfig: true,
    settingSources: [],

    pathToClaudeCodeExecutable: opts.claudeExecutable ?? resolveClaudeExecutable(),
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.systemPrompt ? { systemPrompt: opts.systemPrompt } : {}),
    ...(opts.maxTurns ? { maxTurns: opts.maxTurns } : {}),
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    ...(opts.abortController ? { abortController: opts.abortController } : {}),
  };

  return query({ prompt, options });
}

export type { SDKMessage };
