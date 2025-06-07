import type { MCPServerConfig, ToolDefinition } from "@/server/mcp/types";
import { McpMarketplaceItem, MCPServer } from "@/shared/types/settings";
import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface McpState {
  // Marketplace data
  mcpMarketItems: McpMarketplaceItem[];
  loadingMarketplace: boolean;

  // Server configurations and servers
  mcpServerConfigs: Record<string, MCPServerConfig>;
  loadingMcpConfigs: boolean;
  mcpServers: MCPServer[];
  loadingMcpServers: boolean;

  // Installation state
  installingTools: Record<string, boolean>;

  // Actions
  fetchMcpMarketplace: () => Promise<void>;
  fetchMcpConfigurations: () => Promise<void>;
  fetchAllMcpServers: () => Promise<void>;
  getMcpServerTools: (id: string) => Promise<ToolDefinition[]>;

  handleInstallPredefinedServer: (serverId: string) => Promise<void>;
  handleUninstallPredefinedServer: (serverId: string) => Promise<void>;
  handleInstallMcpTool: (tool: McpMarketplaceItem) => Promise<void>;
  handleManualInstallMcp: (configJson: string) => Promise<void>;

  handleMcpConfigChange: (
    id: string,
    field: keyof MCPServerConfig,
    value:
      | string
      | number
      | boolean
      | string[]
      | Record<string, string>
      | undefined,
  ) => Promise<void>;
  handleSaveMcpConfig: (id: string) => Promise<void>;

  refreshAll: () => Promise<void>;
}

// Helper function for API requests with retry logic
const fetchWithRetry = async (
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
): Promise<Response> => {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);

      // If we get a connection refused error, wait and retry
      if (!response.ok && i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))); // Progressive delay
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      // If this is a connection error and we have retries left, wait and try again
      if (
        error instanceof TypeError &&
        error.message.includes("fetch") &&
        i < maxRetries - 1
      ) {
        console.log(
          `MCP API connection failed, retrying in ${1000 * (i + 1)}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("Max retries exceeded");
};

export const useMcpStore = create<McpState>()(
  persist(
    (set, get) => ({
      // Initial state
      mcpMarketItems: [],
      loadingMarketplace: false,
      mcpServerConfigs: {},
      loadingMcpConfigs: false,
      mcpServers: [],
      loadingMcpServers: false,
      installingTools: {},

      // Fetch marketplace data
      fetchMcpMarketplace: async () => {
        set({ loadingMarketplace: true });
        try {
          const response = await fetchWithRetry(
            "http://localhost:38000/api/mcp/marketplace",
          );
          if (!response.ok) throw new Error("Failed to fetch marketplace data");
          const data = await response.json();
          set({ mcpMarketItems: data.catalog?.items || [] });
        } catch (error) {
          console.error("Error fetching MCP marketplace:", error);
          // Only show error toast if it's not a connection issue (server might be starting)
          if (
            !(error instanceof TypeError && error.message.includes("fetch"))
          ) {
            toast.error("Failed to load MCP marketplace data");
          }
          set({ mcpMarketItems: [] }); // Set empty array on error
        } finally {
          set({ loadingMarketplace: false });
        }
      },

      // Fetch MCP configurations
      fetchMcpConfigurations: async () => {
        set({ loadingMcpConfigs: true });
        try {
          const response = await fetchWithRetry(
            "http://localhost:38000/api/mcp/configurations",
          );
          if (!response.ok)
            throw new Error("Failed to fetch MCP configurations");
          const data = await response.json();
          if (data.status === "success") {
            set({ mcpServerConfigs: data.configurations || {} });
          } else {
            throw new Error(
              data.message || "Failed to fetch MCP configurations",
            );
          }
        } catch (error) {
          console.error("Error fetching MCP configurations:", error);
          // Only show error toast if it's not a connection issue
          if (
            !(error instanceof TypeError && error.message.includes("fetch"))
          ) {
            toast.error("Failed to load MCP configurations");
          }
          set({ mcpServerConfigs: {} });
        } finally {
          set({ loadingMcpConfigs: false });
        }
      },

      // Fetch all MCP servers
      fetchAllMcpServers: async () => {
        set({ loadingMcpServers: true });
        try {
          const [predefinedResponse, installedResponse] = await Promise.all([
            fetchWithRetry("http://localhost:38000/api/mcp/predefined-servers"),
            fetchWithRetry("http://localhost:38000/api/mcp/installed-servers"),
          ]);

          if (!predefinedResponse.ok || !installedResponse.ok) {
            throw new Error("Failed to fetch MCP servers");
          }

          const predefinedData = await predefinedResponse.json();
          const installedData = await installedResponse.json();

          if (
            predefinedData.status === "success" &&
            installedData.status === "success"
          ) {
            const predefinedServers = predefinedData.servers || [];
            const installedServers = installedData.servers || [];
            const mergedServers: MCPServer[] = [];

            mergedServers.push(...installedServers);
            predefinedServers.forEach((server: MCPServer) => {
              if (!server.isInstalled) {
                mergedServers.push(server);
              }
            });

            set({ mcpServers: mergedServers });
          } else {
            throw new Error("Failed to fetch MCP servers data");
          }
        } catch (error) {
          console.error("Error fetching MCP servers:", error);
          // Only show error toast if it's not a connection issue
          if (
            !(error instanceof TypeError && error.message.includes("fetch"))
          ) {
            toast.error("Failed to load MCP server data");
          }
          set({ mcpServers: [] });
        } finally {
          set({ loadingMcpServers: false });
        }
      },

      getMcpServerTools: async (id: string) => {
        const response = await fetchWithRetry(
          `http://localhost:38000/api/mcp/servers/${id}/tools`,
        );
        if (!response.ok) {
          throw new Error(
            `Failed to fetch tools for MCP server ${id}: ${response.status}`,
          );
        }
        const data = await response.json();
        return Array.isArray(data.tools) ? data.tools : [];
      },

      // Install predefined server
      handleInstallPredefinedServer: async (serverId: string) => {
        const { installingTools } = get();
        if (installingTools[serverId]) return;

        set({ installingTools: { ...installingTools, [serverId]: true } });
        try {
          const response = await fetch(
            "http://localhost:38000/api/mcp/predefined-servers/install",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: serverId }),
            },
          );

          if (!response.ok) {
            let errorData;
            try {
              errorData = await response.json();
            } catch {
              errorData = { message: "Failed to install server" };
            }
            throw new Error(errorData.message || "Failed to install server");
          }

          toast.success(`Server ${serverId} installed successfully`);
          await get().fetchAllMcpServers();
          await get().fetchMcpConfigurations();
        } catch (error) {
          console.error(`Error installing server ${serverId}:`, error);
          toast.error(
            `Failed to install server: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        } finally {
          const currentInstallingTools = get().installingTools;
          set({
            installingTools: { ...currentInstallingTools, [serverId]: false },
          });
        }
      },

      // Uninstall predefined server
      handleUninstallPredefinedServer: async (serverId: string) => {
        try {
          const response = await fetch(
            "http://localhost:38000/api/mcp/predefined-servers/uninstall",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: serverId }),
            },
          );

          if (!response.ok) {
            let errorData;
            try {
              errorData = await response.json();
            } catch {
              errorData = { message: "Failed to uninstall server" };
            }
            throw new Error(errorData.message || "Failed to uninstall server");
          }

          toast.success(`Server ${serverId} uninstalled successfully`);
          await get().fetchAllMcpServers();
          await get().fetchMcpConfigurations();
        } catch (error) {
          console.error(`Error uninstalling server ${serverId}:`, error);
          toast.error(
            `Failed to uninstall server: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          throw error;
        }
      },

      // Install MCP tool (placeholder implementation)
      handleInstallMcpTool: async (tool: McpMarketplaceItem) => {
        const { installingTools } = get();
        if (installingTools[tool.mcpId]) return;

        set({ installingTools: { ...installingTools, [tool.mcpId]: true } });
        toast.success(`Installed ${tool.name} successfully`);
        set({
          installingTools: { ...get().installingTools, [tool.mcpId]: false },
        });
      },

      // Manual install MCP configuration
      handleManualInstallMcp: async (configJson: string) => {
        try {
          let config;
          try {
            config = JSON.parse(configJson);
          } catch {
            toast.error("Invalid JSON format");
            throw new Error("Invalid JSON format");
          }

          if (!config.mcpServers || typeof config.mcpServers !== "object") {
            toast.error("Invalid configuration: missing 'mcpServers' object");
            throw new Error("Invalid configuration structure");
          }

          const response = await fetch(
            "http://localhost:38000/api/mcp/configurations/manual",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(config),
            },
          );

          if (!response.ok) {
            let errorData;
            try {
              errorData = await response.json();
            } catch {
              errorData = { message: "Failed to install MCP configuration" };
            }
            throw new Error(
              errorData.message || "Failed to install MCP configuration",
            );
          }

          toast.success("MCP configuration installed successfully");
          await get().fetchAllMcpServers();
          await get().fetchMcpConfigurations();
        } catch (error) {
          console.error("Error installing manual MCP configuration:", error);
          toast.error(
            `Failed to install configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          throw error;
        }
      },

      // Handle MCP config field changes
      handleMcpConfigChange: async (
        id: string,
        field: keyof MCPServerConfig,
        value:
          | string
          | number
          | boolean
          | string[]
          | Record<string, string>
          | undefined,
      ) => {
        const { mcpServerConfigs } = get();

        // Update state with the new value
        set({
          mcpServerConfigs: {
            ...mcpServerConfigs,
            [id]: {
              ...mcpServerConfigs[id],
              [field]: value,
            },
          },
        });

        // Automatically save when enabling/disabling a server
        if (field === "enabled") {
          try {
            const currentConfig = {
              ...mcpServerConfigs[id],
              [field]: value,
              env: mcpServerConfigs[id].env || {},
            };

            const response = await fetch(
              `http://localhost:38000/api/mcp/configurations/${id}`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(currentConfig),
              },
            );

            if (!response.ok) {
              let errorData;
              try {
                errorData = await response.json();
              } catch {
                errorData = { message: "Failed to save MCP configuration" };
              }
              throw new Error(
                errorData.message || "Failed to save MCP configuration",
              );
            }

            if (value === true) {
              toast.info(
                `Starting MCP server ${mcpServerConfigs[id].name || id}...`,
              );

              const startResponse = await fetch(
                `http://localhost:38000/api/mcp/servers/${id}/start`,
                { method: "POST" },
              );

              if (!startResponse.ok) {
                let errorData;
                try {
                  errorData = await startResponse.json();
                } catch {
                  errorData = { message: "Failed to start MCP server" };
                }
                throw new Error(
                  errorData.message || "Failed to start MCP server",
                );
              }

              toast.success(
                `Server ${mcpServerConfigs[id].name || id} started successfully`,
              );
            } else {
              toast.info(
                `Stopping MCP server ${mcpServerConfigs[id].name || id}...`,
              );

              try {
                const stopResponse = await fetch(
                  `http://localhost:38000/api/mcp/servers/${id}/stop`,
                  { method: "POST" },
                );

                if (!stopResponse.ok) {
                  let errorData;
                  try {
                    errorData = await stopResponse.json();
                  } catch {
                    errorData = { message: "Failed to stop MCP server" };
                  }
                  console.warn(
                    `Warning when stopping server: ${errorData.message}`,
                  );
                } else {
                  toast.success(
                    `Server ${mcpServerConfigs[id].name || id} stopped and disabled`,
                  );
                }
              } catch (err) {
                console.error(`Error stopping server ${id}:`, err);
              }
            }
          } catch (error) {
            console.error(`Error managing MCP server ${id}:`, error);
            toast.error(
              `Failed to ${value ? "enable" : "disable"} server: ${error instanceof Error ? error.message : "Unknown error"}`,
            );

            // Revert the change in UI if save failed
            const currentConfigs = get().mcpServerConfigs;
            set({
              mcpServerConfigs: {
                ...currentConfigs,
                [id]: {
                  ...currentConfigs[id],
                  [field]: !value,
                },
              },
            });
          }
        }
      },

      // Save MCP configuration
      handleSaveMcpConfig: async (id: string) => {
        const { mcpServerConfigs } = get();
        const configToSave = mcpServerConfigs[id];
        if (!configToSave) return;

        try {
          const payload = {
            ...configToSave,
            env: configToSave.env || {},
          };

          const response = await fetch(
            `http://localhost:38000/api/mcp/configurations/${id}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );

          if (!response.ok) {
            let errorData;
            try {
              errorData = await response.json();
            } catch {
              errorData = { message: "Failed to save MCP configuration" };
            }
            throw new Error(
              errorData.message || "Failed to save MCP configuration",
            );
          }

          toast.success(`Configuration for ${configToSave.name || id} saved.`);
        } catch (error) {
          console.error(`Error saving MCP configuration for ${id}:`, error);
          toast.error(
            `Failed to save configuration for ${configToSave.name || id}: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },

      // Refresh all data
      refreshAll: async () => {
        console.log("MCP Store: Refreshing all data...");
        await Promise.all([
          get().fetchMcpMarketplace(),
          get().fetchMcpConfigurations(),
          get().fetchAllMcpServers(),
        ]);
      },
    }),
    {
      name: "mcp-storage",
      partialize: (state) => ({
        mcpMarketItems: state.mcpMarketItems,
        mcpServerConfigs: state.mcpServerConfigs,
        mcpServers: state.mcpServers,
      }),
    },
  ),
);
