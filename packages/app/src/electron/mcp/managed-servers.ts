import type { MCPConfig, MCPServerConfig } from "@/shared/types/mcp";

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
