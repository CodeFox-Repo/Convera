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
  lastFetchTime: number | null;
  isFetching: boolean;

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
  // handleAddServer: (id: string, config: MCPServerConfig) => Promise<void>;
  handleManualInstallMcp: (configJson: string) => Promise<void>;
  handleRemoveServer: (id: string) => Promise<void>;

  refreshAll: () => Promise<void>;
  subscribeMcpChanges: () => () => void;
}

export const useMcpStore = create<McpState>()(
  persist(
    (set, get) => ({
      // Initial state
      mcpServerConfigs: null,
      loadingMcpConfigs: false,
      mcpServers: [],
      loadingMcpServers: false,
      lastFetchTime: null,
      isFetching: false,

      // Fetch MCP configurations via IPC
      fetchMcpConfigurations: async () => {
        set({ loadingMcpConfigs: true });
        try {
          const response = await window.mcpAPI.getConfigurations();
          if (response.success && response.data) {
            set({ mcpServerConfigs: response.data });
            localStorage.setItem(
              "mcpServerConfigs",
              JSON.stringify(response.data),
            );
            window.dispatchEvent(
              new CustomEvent("mcp-configs-updated", { detail: response.data }),
            );
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
            localStorage.setItem("mcpServers", JSON.stringify(response.data));
            window.dispatchEvent(
              new CustomEvent("mcp-servers-updated", { detail: response.data }),
            );
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
        if (field === "disabled") {
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

      // // Add new server
      // handleAddServer: async (id: string, config: MCPServerConfig) => {
      //   try {
      //     window.mcpAPI.addServer(id, config);

      //     // wait for 2000ms and then refresh data
      //     await new Promise((resolve) => setTimeout(resolve, 2000));
      //     await Promise.all([
      //       get().fetchMcpConfigurations(),
      //       get().fetchAllMcpServers(),
      //     ]);
      //   } catch (error) {
      //     console.error(`Error adding server ${id}:`, error);
      //     toast.error(
      //       `Failed to add server: ${error instanceof Error ? error.message : "Unknown error"}`,
      //     );
      //     throw error;
      //   }
      // },

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
              window.mcpAPI.addServer(serverId, serverConfig);
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
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await Promise.all([
            get().fetchMcpConfigurations(),
            get().fetchAllMcpServers(),
          ]);

          // Emit event to notify other components
          window.dispatchEvent(new CustomEvent("mcp-servers-modified"));
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

          // Emit event to notify other components
          window.dispatchEvent(new CustomEvent("mcp-servers-modified"));
        } catch (error) {
          console.error(`Error removing server ${id}:`, error);
          toast.error(
            `Failed to remove server: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          throw error;
        }
      },

      // Refresh all data with debouncing
      refreshAll: async () => {
        const { isFetching, lastFetchTime } = get();
        const now = Date.now();

        // Prevent concurrent fetches
        if (isFetching) {
          console.log("MCP refresh already in progress, skipping...");
          return;
        }

        // Debounce rapid calls (within 1 second)
        if (lastFetchTime && now - lastFetchTime < 1000) {
          console.log("MCP refresh called too soon, skipping...");
          return;
        }

        set({ isFetching: true });
        try {
          await Promise.all([
            get().fetchMcpConfigurations(),
            get().fetchAllMcpServers(),
          ]);
          set({ lastFetchTime: now });
        } finally {
          set({ isFetching: false });
        }
      },

      subscribeMcpChanges: () => {
        const customEventHandler = (() => {
          // Trigger a refresh when MCP servers are modified
          get().refreshAll();
        }) as EventListener;

        const storageEventHandler = ((event: StorageEvent) => {
          if (event.key === "mcpServerConfigs" && event.newValue) {
            try {
              const parsedConfigs = JSON.parse(event.newValue);
              set({ mcpServerConfigs: parsedConfigs });
            } catch (error) {
              console.error(
                "Error parsing mcpServerConfigs from storage:",
                error,
              );
            }
          }

          if (event.key === "mcpServers" && event.newValue) {
            try {
              const parsedServers = JSON.parse(event.newValue);
              set({ mcpServers: parsedServers });
            } catch (error) {
              console.error("Error parsing mcpServers from storage:", error);
            }
          }
        }) as EventListener;

        window.addEventListener("mcp-configs-updated", customEventHandler);
        window.addEventListener("mcp-servers-updated", customEventHandler);
        window.addEventListener("mcp-servers-modified", customEventHandler);
        window.addEventListener("storage", storageEventHandler);

        return () => {
          window.removeEventListener("mcp-configs-updated", customEventHandler);
          window.removeEventListener("mcp-servers-updated", customEventHandler);
          window.removeEventListener(
            "mcp-servers-modified",
            customEventHandler,
          );
          window.removeEventListener("storage", storageEventHandler);
        };
      },
    }),
    {
      name: "mcp-storage",
      partialize: () => {
        // Don't persist server data to avoid stale data issues
        // Data should be fetched fresh on each app start
        return {};
      },
      version: 2, // Increment version to clear old persisted data
    },
  ),
);
