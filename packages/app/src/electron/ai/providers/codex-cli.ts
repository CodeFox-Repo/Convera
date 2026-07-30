import type { LocalAIChatRequest } from "@/shared/types/local-ai";
import type { LanguageModel } from "ai";
import type { CodexAppServerProvider } from "ai-sdk-provider-codex-cli";
import type { ZodEffects, ZodTypeAny } from "zod";
import { probeCliProvider } from "../cli-probe";
import type { LocalAiProviderAdapter } from "../provider-adapter";
import type { LocalAiProviderStatus } from "../types";

export class CodexCliAdapter implements LocalAiProviderAdapter {
  readonly id = "codex-cli" as const;

  private provider?: CodexAppServerProvider;
  private providerExecutablePath?: string;
  private modelCatalog?: {
    defaultModel: string;
    models: string[];
  };

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

  async createModel(
    request: LocalAIChatRequest,
    status: LocalAiProviderStatus,
  ): Promise<LanguageModel> {
    await this.ensureProvider(status.executablePath);

    return this.provider!(request.modelId ?? status.defaultModel, {
      cwd: request.options?.cwd,
    });
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
        threadMode: "stateless",
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
