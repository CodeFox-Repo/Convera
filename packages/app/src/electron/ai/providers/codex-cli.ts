import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type {
  CodexAppServerProvider,
  CodexAppServerRequestHandlers,
} from "ai-sdk-provider-codex-cli";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type { ZodEffects, ZodTypeAny } from "zod";
import { probeCliProvider } from "../cli-probe";
import {
  resolveLocalModelId,
  type LocalAiProviderAdapter,
  type LocalAiProviderRun,
} from "../provider-adapter";
import type { LocalAiProviderStatus } from "../types";
import { createCodexMcpServer } from "./codex-mcp-server";

const execFile = promisify(execFileCallback);

type CodexConfigOverride = string | number | boolean | object;

const CODEX_TEXT_ONLY_FEATURES = [
  "apps",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "chronicle",
  "code_mode",
  "code_mode_host",
  "computer_use",
  "deferred_executor",
  "enable_mcp_apps",
  "executor_capability_discovery",
  "goals",
  "hooks",
  "image_generation",
  "in_app_browser",
  "mcp_2026_07_28",
  "memories",
  "multi_agent",
  "plugins",
  "remote_plugin",
  "rmcp_client",
  "shell_snapshot",
  "shell_tool",
  "skill_mcp_dependency_install",
  "skill_search",
  "tool_call_mcp_elicitation",
  "tool_suggest",
  "unified_exec",
  "workspace_dependencies",
] as const;

export function createCodexTextOnlyConfigOverrides(
  mcpServerNames: readonly string[],
): Record<string, CodexConfigOverride> {
  return {
    ...Object.fromEntries(
      CODEX_TEXT_ONLY_FEATURES.map((feature) => [`features.${feature}`, false]),
    ),
    "agents.enabled": false,
    "tools.view_image": false,
    "tools.web_search": false,
    web_search: "disabled",
    mcp_servers: Object.fromEntries(
      mcpServerNames.map((name) => [name, { enabled: false }]),
    ),
  };
}

interface CodexMcpListEntry {
  name?: unknown;
}

async function listConfiguredCodexMcpServers(
  executablePath?: string,
): Promise<string[]> {
  try {
    const { stdout } = await execFile(
      executablePath || "codex",
      ["mcp", "list", "--json"],
      {
        timeout: 5_000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    const parsed: unknown = JSON.parse(stdout);
    if (!Array.isArray(parsed)) {
      throw new TypeError("Codex MCP list was not an array.");
    }
    return parsed.map((entry) => {
      const name = (entry as CodexMcpListEntry)?.name;
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new TypeError("Codex MCP list contained an invalid server name.");
      }
      return name;
    });
  } catch (error) {
    throw Object.assign(
      new Error(
        `Cannot establish the Codex text-only boundary because configured MCP servers could not be enumerated: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
      { code: "LOCAL_AI_TEXT_ONLY_POLICY_UNAVAILABLE" },
    );
  }
}

export interface CodexCliAdapterOptions {
  listConfiguredMcpServers?: (executablePath?: string) => Promise<string[]>;
}

export class CodexCliAdapter implements LocalAiProviderAdapter {
  readonly id = "codex-cli" as const;

  private readonly listConfiguredMcpServers: (
    executablePath?: string,
  ) => Promise<string[]>;
  private provider?: CodexAppServerProvider;
  private providerExecutablePath?: string;
  private modelCatalog?: {
    defaultModel: string;
    models: string[];
  };

  constructor(options: CodexCliAdapterOptions = {}) {
    this.listConfiguredMcpServers =
      options.listConfiguredMcpServers ?? listConfiguredCodexMcpServers;
  }

  async getStatus(): Promise<LocalAiProviderStatus> {
    const status = await probeCliProvider(this.id);
    if (!status.available || !status.authenticated) {
      return status;
    }

    try {
      await this.ensureProvider(status.executablePath);
      if (!this.modelCatalog) {
        const catalog = await this.provider!.listModels();
        const models = catalog.models.map((model) => model.id);
        const defaultModel = catalog.defaultModel?.id ?? models[0];
        if (defaultModel && models.length > 0) {
          this.modelCatalog = { defaultModel, models };
        }
      }
    } catch (error) {
      return {
        ...status,
        detail: `Model discovery failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    return this.modelCatalog ? { ...status, ...this.modelCatalog } : status;
  }

  async prepareRun(
    request: LocalAIChatRequest,
    status: LocalAiProviderStatus,
    context: Parameters<LocalAiProviderAdapter["prepareRun"]>[2],
  ): Promise<LocalAiProviderRun> {
    await this.ensureProvider(status.executablePath);
    const textOnly = context.executionPolicy === "text-only";
    const { tool } = await importCodexProviderWithZod3Compatibility();
    const exposedTools = textOnly ? [] : context.tools;
    const tools = exposedTools.map((definition) =>
      tool({
        name: definition.name,
        description: definition.description,
        parameters: definition.inputValidator,
        execute: async (input) =>
          definition.execute(input as Record<string, unknown>),
      }),
    );
    const mcpServer =
      tools.length > 0
        ? createCodexMcpServer({
            name: "convera",
            tools,
            definitions: context.tools,
          })
        : undefined;
    const requestApproval = async (
      name: string,
      prompt: string,
      input: unknown,
    ) =>
      (
        await context.requestInteraction({
          kind: "approval",
          name,
          prompt,
          input,
          options: ["Allow once", "Deny"],
        })
      ).approved === true;
    const interactiveServerRequests: CodexAppServerRequestHandlers = {
      onCommandExecutionApproval: async ({ params }) => ({
        decision: (await requestApproval(
          "codex:command_execution",
          `Allow Codex to execute this command?\n${params.command ?? ""}`,
          params,
        ))
          ? "accept"
          : "decline",
      }),
      onFileChangeApproval: async ({ params }) => ({
        decision: (await requestApproval(
          "codex:file_change",
          "Allow Codex to modify files in the current workspace?",
          params,
        ))
          ? "accept"
          : "decline",
      }),
      onSkillApproval: async () => ({ decision: "decline" }),
      onMcpElicitation: async ({ params }) =>
        params._meta?.codex_approval_kind === "mcp_tool_call"
          ? { action: "accept", content: {} }
          : { action: "decline", content: null },
    };
    const textOnlyServerRequests: CodexAppServerRequestHandlers = {
      onCommandExecutionApproval: async () => ({ decision: "decline" }),
      onFileChangeApproval: async () => ({ decision: "decline" }),
      onSkillApproval: async () => ({ decision: "decline" }),
      onMcpElicitation: async () => ({
        action: "decline",
        content: null,
      }),
    };
    const serverRequests = textOnly
      ? textOnlyServerRequests
      : interactiveServerRequests;
    const cwd = request.options?.cwd;
    const configOverrides = textOnly
      ? createCodexTextOnlyConfigOverrides(
          await this.listConfiguredMcpServers(status.executablePath),
        )
      : undefined;

    const model = this.provider!(
      resolveLocalModelId(request.modelId, status.defaultModel),
      {
        cwd,
        mcpServers: mcpServer ? { convera: mcpServer } : undefined,
        serverRequests,
        approvalPolicy: textOnly ? "never" : "on-request",
        sandboxPolicy: textOnly
          ? "read-only"
          : {
              type: "workspaceWrite",
              writableRoots: cwd ? [cwd] : [],
              networkAccess: false,
            },
        configOverrides,
      },
    );
    const providerOptions = context.session
      ? {
          "codex-app-server": {
            threadId: context.session.nativeSessionId,
          },
        }
      : {
          "codex-app-server": {
            threadMode: "persistent" as const,
          },
        };

    return {
      model,
      providerOptions,
      getNativeSessionId(metadata) {
        const nativeSessionId = metadata?.["codex-app-server"]?.threadId;
        if (
          typeof nativeSessionId !== "string" ||
          nativeSessionId.trim().length === 0
        ) {
          throw Object.assign(
            new Error("Codex did not return a persistent thread id."),
            { code: "LOCAL_AI_SESSION_METADATA_INVALID" },
          );
        }
        return nativeSessionId;
      },
    };
  }

  async dispose(): Promise<void> {
    const provider = this.provider;
    this.provider = undefined;
    this.providerExecutablePath = undefined;
    this.modelCatalog = undefined;
    await provider?.close();
  }

  private async ensureProvider(executablePath?: string): Promise<void> {
    if (this.provider && this.providerExecutablePath === executablePath) {
      return;
    }

    await this.dispose();
    const { createCodexAppServer } =
      await importCodexProviderWithZod3Compatibility();
    this.providerExecutablePath = executablePath;
    this.provider = createCodexAppServer({
      defaultSettings: {
        codexPath: executablePath,
        minCodexVersion: "0.144.0",
        autoApprove: false,
        approvalPolicy: "on-request",
        sandboxPolicy: "read-only",
        idleTimeoutMs: 5 * 60_000,
        logger: false,
      },
    });
  }
}

/**
 * ai-sdk-provider-codex-cli 1.1-1.3 declares Zod 3 support but one app-server
 * response schema calls `.passthrough()` after `.refine()`. Zod 3 returns a
 * ZodEffects from refine, whereas Zod 4 forwards the object method.
 *
 * The refined schema declares both fields it consumes (`id` and `result`), so
 * retaining Zod 3's default unknown-key stripping is sufficient. Keep this
 * narrowly scoped shim until the provider fixes the upstream chain. The
 * prototype is restored immediately after module evaluation, so other schemas
 * retain their normal Zod 3 behavior.
 */
async function importCodexProviderWithZod3Compatibility(): Promise<
  typeof import("ai-sdk-provider-codex-cli")
> {
  // This must be a dynamic ESM import. Electron/Vite may load the provider's
  // Zod peer through its ESM entry while a static app import resolves CJS;
  // patching the other module instance would not affect provider evaluation.
  const { ZodEffects } = await import("zod");
  const prototype = ZodEffects.prototype as typeof ZodEffects.prototype & {
    passthrough?: () => unknown;
  };
  if (prototype.passthrough) {
    return import("ai-sdk-provider-codex-cli");
  }

  Object.defineProperty(prototype, "passthrough", {
    configurable: true,
    value(this: ZodEffects<ZodTypeAny>) {
      const parseRefinedSchema = this._parse.bind(this);
      const innerObject = this.innerType() as unknown as {
        passthrough(): object;
      };
      const objectSchema = innerObject.passthrough() as object & {
        _parse?: unknown;
      };

      // Zod 3's discriminatedUnion requires an object with a `shape`, while
      // parsing still needs the original refinement. Delegate only this
      // returned schema's parser back to the ZodEffects instance.
      Object.defineProperty(objectSchema, "_parse", {
        configurable: true,
        value: parseRefinedSchema,
      });
      return objectSchema;
    },
  });

  try {
    return await import("ai-sdk-provider-codex-cli");
  } finally {
    delete prototype.passthrough;
  }
}
