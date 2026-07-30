import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ALLOWED_CLAUDE_ENVIRONMENT_PREFIXES = [
  "ANTHROPIC_",
  "CLAUDE_CODE_",
] as const;

export function pickClaudeEnvironment(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const environment: Record<string, string> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (
      typeof entry === "string" &&
      ALLOWED_CLAUDE_ENVIRONMENT_PREFIXES.some((prefix) =>
        name.startsWith(prefix),
      )
    ) {
      environment[name] = entry;
    }
  }
  return environment;
}

export function loadClaudeEnvironment(
  settingsPath = join(homedir(), ".claude", "settings.json"),
): NodeJS.ProcessEnv {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      env?: unknown;
    };
    return {
      ...process.env,
      ...pickClaudeEnvironment(settings.env),
    };
  } catch {
    return { ...process.env };
  }
}
