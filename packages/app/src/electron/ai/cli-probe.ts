import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { LocalAiProviderId, LocalAiProviderStatus } from "./types";
import { LOCAL_AI_PROVIDER_DESCRIPTORS } from "./provider-descriptors";

const execFileAsync = promisify(execFile);
const PROBE_TIMEOUT_MS = 5_000;

interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CliCommandRunner = (
  command: string,
  args: string[],
) => Promise<CommandResult>;

interface CliDefinition {
  providerId: LocalAiProviderId;
  executableName: string;
  environmentVariable: string;
  versionArgs: string[];
  authArgs: string[];
  isAuthenticated: (result: CommandResult) => boolean;
}

const CLI_DEFINITIONS: Record<LocalAiProviderId, CliDefinition> = {
  "claude-code": {
    providerId: "claude-code",
    executableName: "claude",
    environmentVariable: "CONVERA_CLAUDE_PATH",
    versionArgs: ["--version"],
    authArgs: ["auth", "status", "--json"],
    isAuthenticated: ({ stdout }) => {
      try {
        const status = JSON.parse(stdout) as { loggedIn?: unknown };
        return status.loggedIn === true;
      } catch {
        return false;
      }
    },
  },
  "codex-cli": {
    providerId: "codex-cli",
    executableName: "codex",
    environmentVariable: "CONVERA_CODEX_PATH",
    versionArgs: ["--version"],
    authArgs: ["login", "status"],
    isAuthenticated: ({ stdout, stderr }) =>
      /logged in/i.test(`${stdout}\n${stderr}`),
  },
};

function defaultRunner(
  command: string,
  args: string[],
): Promise<CommandResult> {
  return execFileAsync(command, args, {
    timeout: PROBE_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

function executableCandidates(
  definition: CliDefinition,
  environment: NodeJS.ProcessEnv,
  homeDirectory: string,
): string[] {
  const configuredPath = environment[definition.environmentVariable];
  const candidates = [
    configuredPath,
    join(homeDirectory, ".local", "bin", definition.executableName),
    join(homeDirectory, ".npm-global", "bin", definition.executableName),
    `/opt/homebrew/bin/${definition.executableName}`,
    `/usr/local/bin/${definition.executableName}`,
    definition.executableName,
  ].filter((candidate): candidate is string => Boolean(candidate));

  return [...new Set(candidates)];
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function probeCliProvider(
  providerId: LocalAiProviderId,
  options: {
    run?: CliCommandRunner;
    environment?: NodeJS.ProcessEnv;
    homeDirectory?: string;
  } = {},
): Promise<LocalAiProviderStatus> {
  const definition = CLI_DEFINITIONS[providerId];
  const descriptor = LOCAL_AI_PROVIDER_DESCRIPTORS[providerId];
  const run = options.run ?? defaultRunner;
  const environment = options.environment ?? process.env;
  const homeDirectory = options.homeDirectory ?? homedir();
  let lastError = "Executable not found";

  for (const candidate of executableCandidates(
    definition,
    environment,
    homeDirectory,
  )) {
    let versionResult: CommandResult;
    try {
      versionResult = await run(candidate, definition.versionArgs);
    } catch (error) {
      lastError = errorDetail(error);
      continue;
    }

    const version =
      versionResult.stdout.trim() || versionResult.stderr.trim() || undefined;

    try {
      const authResult = await run(candidate, definition.authArgs);
      const authenticated = definition.isAuthenticated(authResult);
      return {
        ...descriptor,
        available: true,
        authenticated,
        version,
        executablePath: candidate,
        detail: authenticated
          ? undefined
          : `Run "${definition.executableName} login" to authenticate.`,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        ...descriptor,
        available: true,
        authenticated: false,
        version,
        executablePath: candidate,
        detail: errorDetail(error),
        checkedAt: new Date().toISOString(),
      };
    }
  }

  return {
    ...descriptor,
    available: false,
    authenticated: false,
    detail: `${descriptor.label} CLI was not found. ${lastError}`,
    checkedAt: new Date().toISOString(),
  };
}
