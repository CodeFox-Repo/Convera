import type { LocalAIProviderKind } from "./types/local-ai";

export type StartupProviderId = Extract<
  LocalAIProviderKind,
  "claude-code" | "codex-cli"
>;

const RENDERER_ARGUMENT_PREFIX = "--convera-startup-provider=";

const STARTUP_PROVIDER_ALIASES: Readonly<Record<string, StartupProviderId>> = {
  cc: "claude-code",
  "--cc": "claude-code",
  codex: "codex-cli",
  "--codex": "codex-cli",
};

export function parseStartupProvider(
  argv: readonly string[],
): StartupProviderId | null {
  let providerId: StartupProviderId | null = null;

  for (const argument of argv) {
    const alias = STARTUP_PROVIDER_ALIASES[argument];
    if (alias) {
      providerId = alias;
      continue;
    }

    if (argument.startsWith(RENDERER_ARGUMENT_PREFIX)) {
      const value = argument.slice(RENDERER_ARGUMENT_PREFIX.length);
      if (value === "claude-code" || value === "codex-cli") {
        providerId = value;
      }
    }
  }

  return providerId;
}

export function createRendererStartupProviderArgument(
  providerId: StartupProviderId,
): string {
  return `${RENDERER_ARGUMENT_PREFIX}${providerId}`;
}
