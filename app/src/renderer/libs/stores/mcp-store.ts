import type {
  MCPConfig,
  MCPServerConfig,
  ServerInfo,
  ToolDefinition,
} from "@/shared/types/mcp";
import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface McpState {
  // Server configurations and servers
  mcpServerConfigs: MCPConfig | null;
  loadingMcpConfigs: boolean;
  mcpServers: ServerInfo[];
  loadingMcpServers: boolean;

  // Actions
  fetchMcpConfigurations: () => Promise<void>;
  fetchAllMcpServers: () => Promise<void>;
  getMcpServerTools: (id: string) => Promise<ToolDefinition[]>;

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
  handleAddServer: (id: string, config: MCPServerConfig) => Promise<void>;
  handleManualInstallMcp: (configJson: string) => Promise<void>;
  handleRemoveServer: (id: string) => Promise<void>;

  refreshAll: () => Promise<void>;
}

export const useMcpStore = create<McpState>()(
  persist(
    (set, get) => ({
      // Initial state
      mcpServerConfigs: null,
      loadingMcpConfigs: false,
      mcpServers: [],
      loadingMcpServers: false,

      // Fetch MCP configurations via IPC
      fetchMcpConfigurations: async () => {
        set({ loadingMcpConfigs: true });
        try {
          const response = await window.mcpAPI.getConfigurations();
          if (response.success && response.data) {
            set({ mcpServerConfigs: response.data });
          } else {
            throw new Error(
              response.error || "Failed to fetch MCP configurations",
            );
          }
        } catch (error) {
          console.error("Error fetching MCP configurations:", error);
          toast.error("Failed to load MCP configurations");
          set({ mcpServerConfigs: null });
        } finally {
          set({ loadingMcpConfigs: false });
        }
      },

      // Fetch all MCP servers via IPC
      fetchAllMcpServers: async () => {
        set({ loadingMcpServers: true });
        try {
          const response = await window.mcpAPI.getServers();
          if (response.success && response.data) {
            set({ mcpServers: response.data });
          } else {
            throw new Error(response.error || "Failed to fetch MCP servers");
          }
        } catch (error) {
          console.error("Error fetching MCP servers:", error);
          toast.error("Failed to load MCP server data");
          set({ mcpServers: [] });
        } finally {
          set({ loadingMcpServers: false });
        }
      },

      // Get MCP server tools (placeholder - tools are now in server capabilities)
      getMcpServerTools: async (id: string) => {
        const { mcpServers } = get();
        const server = mcpServers.find((s) => s.name === id);
        return server?.capabilities?.tools || [];
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
        if (!mcpServerConfigs) return;

        // Update local state
        const updatedConfigs = {
          ...mcpServerConfigs,
          mcpServers: {
            ...mcpServerConfigs.mcpServers,
            [id]: {
              ...mcpServerConfigs.mcpServers[id],
              [field]: value,
            },
          },
        };
        set({ mcpServerConfigs: updatedConfigs });

        // Auto-save configuration (without starting/stopping servers)
        if (field === "enabled") {
          try {
            const currentConfig = updatedConfigs.mcpServers[id];
            const response = await window.mcpAPI.updateServer(
              id,
              currentConfig,
            );

            if (!response.success) {
              throw new Error(
                response.error || "Failed to update server configuration",
              );
            }

            // Just show configuration saved message
            toast.success(
              `Configuration for ${currentConfig.name || id} saved`,
            );
          } catch (error) {
            console.error(
              `Error updating MCP server configuration ${id}:`,
              error,
            );
            toast.error(
              `Failed to save configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
            );

            // Revert the change in UI if save failed
            const revertedConfigs = {
              ...mcpServerConfigs,
              mcpServers: {
                ...mcpServerConfigs.mcpServers,
                [id]: {
                  ...mcpServerConfigs.mcpServers[id],
                  [field]: !value,
                },
              },
            };
            set({ mcpServerConfigs: revertedConfigs });
          }
        }
      },

      // Save MCP configuration
      handleSaveMcpConfig: async (id: string) => {
        const { mcpServerConfigs } = get();
        if (!mcpServerConfigs) return;

        const configToSave = mcpServerConfigs.mcpServers[id];
        if (!configToSave) return;

        try {
          const response = await window.mcpAPI.updateServer(id, configToSave);

          if (!response.success) {
            throw new Error(
              response.error || "Failed to save MCP configuration",
            );
          }

          toast.success(`Configuration for ${configToSave.name || id} saved.`);

          // Refresh server data to get updated info
          await get().fetchAllMcpServers();
        } catch (error) {
          console.error(`Error saving MCP configuration for ${id}:`, error);
          toast.error(
            `Failed to save configuration for ${configToSave.name || id}: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },

      // Add new server
      handleAddServer: async (id: string, config: MCPServerConfig) => {
        try {
          const response = await window.mcpAPI.addServer(id, config);

          if (!response.success) {
            throw new Error(response.error || "Failed to add server");
          }

          toast.success(`Server ${config.name || id} added successfully`);

          // Refresh data
          await Promise.all([
            get().fetchMcpConfigurations(),
            get().fetchAllMcpServers(),
          ]);
        } catch (error) {
          console.error(`Error adding server ${id}:`, error);
          toast.error(
            `Failed to add server: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          throw error;
        }
      },

      // Manual MCP installation from JSON configuration
      handleManualInstallMcp: async (configJson: string) => {
        try {
          // Parse the JSON configuration
          let config: MCPConfig;
          try {
            config = JSON.parse(configJson);
          } catch {
            throw new Error("Invalid JSON format");
          }

          if (!config.mcpServers || typeof config.mcpServers !== "object") {
            throw new Error(
              "Invalid configuration: missing 'mcpServers' object",
            );
          }

          // Add each server from the configuration
          const serverEntries = Object.entries(config.mcpServers);
          const errors: string[] = [];
          const successes: string[] = [];

          for (const [serverId, serverConfig] of serverEntries) {
            try {
              const response = await window.mcpAPI.addServer(
                serverId,
                serverConfig,
              );
              if (!response.success) {
                throw new Error(response.error || "Failed to add server");
              }
              successes.push(serverId);
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : "Unknown error";
              errors.push(`${serverId}: ${errorMsg}`);
            }
          }

          // Show results
          if (successes.length > 0) {
            const serverList = successes.join(", ");
            toast.success(
              `Successfully added ${successes.length} server${successes.length > 1 ? "s" : ""}: ${serverList}`,
            );
          }

          if (errors.length > 0) {
            const errorList = errors.join("; ");
            toast.error(`Failed to add some servers: ${errorList}`);
          }

          // If no servers were added successfully, throw error
          if (successes.length === 0) {
            throw new Error("No servers were added successfully");
          }

          // Refresh data after installation
          await Promise.all([
            get().fetchMcpConfigurations(),
            get().fetchAllMcpServers(),
          ]);
        } catch (error) {
          console.error("Error in manual MCP installation:", error);
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";
          toast.error(`Failed to install MCP configuration: ${errorMessage}`);
          throw error;
        }
      },

      // Remove server
      handleRemoveServer: async (id: string) => {
        try {
          const response = await window.mcpAPI.removeServer(id);

          if (!response.success) {
            throw new Error(response.error || "Failed to remove server");
          }

          toast.success(`Server ${id} removed successfully`);

          // Refresh data
          await Promise.all([
            get().fetchMcpConfigurations(),
            get().fetchAllMcpServers(),
          ]);
        } catch (error) {
          console.error(`Error removing server ${id}:`, error);
          toast.error(
            `Failed to remove server: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          throw error;
        }
      },

      // Refresh all data
      refreshAll: async () => {
        await Promise.all([
          get().fetchMcpConfigurations(),
          get().fetchAllMcpServers(),
        ]);
      },
    }),
    {
      name: "mcp-storage",
      partialize: (state) => ({
        mcpServerConfigs: state.mcpServerConfigs,
        mcpServers: state.mcpServers,
      }),
    },
  ),
);
