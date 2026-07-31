import type { MCPConfig, MCPServerConfig } from "@/shared/types/mcp";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, extname, isAbsolute, join, resolve, sep } from "node:path";

export const CUA_SERVER_ID = "cua";

export const CUA_SERVER_CONFIG: Readonly<MCPServerConfig> = {
  name: "Cua",
  description: "Convera-managed Cua Driver computer-use tools",
  command: "cua-driver",
  args: ["mcp"],
  managed: true,
};

export function withManagedServers(config: MCPConfig): MCPConfig {
  const configuredServers = config.mcpServers ?? {};
  const existingCua = configuredServers[CUA_SERVER_ID];
  const normalizedServers = Object.fromEntries(
    Object.entries(configuredServers).map(([name, serverConfig]) => [
      name,
      normalizeManagedServer(name, serverConfig),
    ]),
  );

  return {
    ...config,
    mcpServers: {
      ...normalizedServers,
      [CUA_SERVER_ID]: {
        ...CUA_SERVER_CONFIG,
        disabled: existingCua?.disabled === true,
      },
    },
  };
}

export function normalizeManagedServer(
  name: string,
  config: MCPServerConfig,
): MCPServerConfig {
  if (name !== CUA_SERVER_ID) {
    const userConfig = { ...config };
    delete userConfig.managed;
    return userConfig;
  }

  return {
    ...CUA_SERVER_CONFIG,
    disabled: config.disabled === true,
  };
}

export function resolveManagedStdioExecutable(
  command: string,
  cwd: string,
  environment: Record<string, string>,
): string {
  const hasPathSeparator =
    command.includes(sep) || (sep === "\\" && command.includes("/"));
  const searchDirectories = hasPathSeparator
    ? [cwd]
    : [
        ...(environment.PATH || environment.Path || "")
          .split(delimiter)
          .filter(Boolean),
        join(homedir(), ".local", "bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
      ];
  const extensions =
    process.platform === "win32" && !extname(command)
      ? (environment.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];
  const resolvedCommand = isAbsolute(command) ? command : resolve(cwd, command);
  const candidates = hasPathSeparator
    ? [
        resolvedCommand,
        ...extensions
          .filter(Boolean)
          .map((extension) => `${resolvedCommand}${extension.toLowerCase()}`),
      ]
    : searchDirectories.flatMap((directory) =>
        extensions.map((extension) =>
          join(directory, `${command}${extension.toLowerCase()}`),
        ),
      );

  const executable = candidates.find((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  if (!executable) {
    throw new Error(
      hasPathSeparator
        ? `executable '${command}' was not found`
        : `executable '${command}' was not found on PATH`,
    );
  }

  return executable;
}
