import { useAgentStore } from "@/renderer/libs/stores/agent-store";
import { useMcpStore } from "@/renderer/libs/stores/mcp-store";
import { ToolReference } from "@/server/agents/types";
import { MCPConfig } from "@/shared/types/settings";
import { toast } from "sonner";
import { create } from "zustand";
import type { Agent } from "./agent-store";

export interface ConnectedApp {
  id: string;
  name: string;
  logoUrl: string;
  category: string;
  mcpConfig?: MCPConfig;
}

export interface AvailableApp {
  id: string;
  name: string;
  logoUrl: string;
  category: string;
  mcpConfig?: MCPConfig;
}

interface AppState {
  // State
  connectedApps: ConnectedApp[];
  availableApps: AvailableApp[];
  loading: boolean;
  isConnecting: Record<string, boolean>;

  // Actions
  setConnectedApps: (apps: ConnectedApp[]) => void;
  setAvailableApps: (apps: AvailableApp[]) => void;
  setLoading: (loading: boolean) => void;
  setIsConnecting: (appId: string, connecting: boolean) => void;

  fetchApps: () => Promise<void>;
  connectApp: (app: AvailableApp, onSuccess?: () => void) => Promise<void>;
  disconnectApp: (app: ConnectedApp, onSuccess?: () => void) => Promise<void>;

  // Helper functions for agent integration
  updateDefaultAssistantWithAppTools: (
    app: ConnectedApp | AvailableApp,
  ) => Promise<void>;
  removeAppToolsFromDefaultAssistant: (app: ConnectedApp) => Promise<void>;
}

export const useAppStore = create<AppState>()((set, get) => ({
  // Initial state
  connectedApps: [],
  availableApps: [],
  loading: true,
  isConnecting: {},

  // State setters
  setConnectedApps: (apps: ConnectedApp[]) => {
    set({ connectedApps: apps });
  },

  setAvailableApps: (apps: AvailableApp[]) => {
    set({ availableApps: apps });
  },

  setLoading: (loading: boolean) => {
    set({ loading });
  },

  setIsConnecting: (appId: string, connecting: boolean) => {
    set((state) => ({
      isConnecting: { ...state.isConnecting, [appId]: connecting },
    }));
  },

  // Fetch apps from API
  fetchApps: async () => {
    try {
      get().setLoading(true);
      const response = await fetch("http://localhost:38000/api/apps");

      if (!response.ok) {
        throw new Error("Failed to fetch apps");
      }

      const result = await response.json();

      if (result.success) {
        get().setConnectedApps(result.data.connected || []);
        get().setAvailableApps(result.data.available || []);
      } else {
        throw new Error(result.error || "Failed to fetch apps");
      }
    } catch (error) {
      console.error("Error fetching apps:", error);
      toast.error("Failed to load apps");
    } finally {
      get().setLoading(false);
    }
  },

  // Connect an app
  connectApp: async (app: AvailableApp, onSuccess?: () => void) => {
    get().setIsConnecting(app.id, true);
    try {
      const response = await fetch("http://localhost:38000/api/apps/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ appId: app.id }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        // Refresh the apps list
        await get().fetchApps();

        // Update DefaultAssistant agent with new app's tools
        await get().updateDefaultAssistantWithAppTools(app);

        onSuccess?.();
      } else {
        throw new Error(result.error || "Failed to connect app");
      }
    } catch (error) {
      console.error(`Error connecting to ${app.name}:`, error);
      toast.error(`Failed to connect to ${app.name}`);
    } finally {
      get().setIsConnecting(app.id, false);
    }
  },

  // Disconnect an app
  disconnectApp: async (app: ConnectedApp, onSuccess?: () => void) => {
    try {
      const response = await fetch(
        "http://localhost:38000/api/apps/disconnect",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ appId: app.id }),
        },
      );

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        // Refresh the apps list
        await get().fetchApps();

        // Remove app's tools from DefaultAssistant agent
        await get().removeAppToolsFromDefaultAssistant(app);

        onSuccess?.();
      } else {
        throw new Error(result.error || "Failed to disconnect app");
      }
    } catch (error) {
      console.error(`Error disconnecting from ${app.name}:`, error);
      toast.error(`Failed to disconnect from ${app.name}`);
    }
  },

  // Function to update DefaultAssistant agent with new app's tools
  updateDefaultAssistantWithAppTools: async (
    app: ConnectedApp | AvailableApp,
  ) => {
    try {
      const { fetchAgents, saveAgent } = useAgentStore.getState();
      const { getMcpServerTools } = useMcpStore.getState();

      // Fetch latest agents to ensure we have current data
      await fetchAgents();

      // Find the DefaultAssistant agent
      const defaultAgent = useAgentStore
        .getState()
        .availableAgents.find(
          (agent: Agent) => agent.id === "DefaultAssistant",
        );

      if (!defaultAgent) {
        console.warn("DefaultAssistant agent not found");
        return;
      }

      // If the app has MCP config, get its tools and add them to the agent
      if (app.mcpConfig) {
        try {
          // Get the MCP server tools for this app
          const appTools = await getMcpServerTools(app.id);

          if (appTools && appTools.length > 0) {
            // Create tool references for the new tools
            const newToolReferences: ToolReference[] = appTools.map(
              (tool: any) => ({
                mcpName: app.id,
                toolName: tool.name,
                isBuiltIn: false,
              }),
            );

            // Get current tool references and avoid duplicates
            const currentToolReferences = defaultAgent.toolReferences || [];
            const existingToolNames = new Set(
              currentToolReferences
                .filter((ref: ToolReference) => ref.mcpName === app.id)
                .map((ref: ToolReference) => ref.toolName),
            );

            // Only add tools that don't already exist
            const toolsToAdd = newToolReferences.filter(
              (newRef) => !existingToolNames.has(newRef.toolName),
            );

            if (toolsToAdd.length > 0) {
              // Update the agent with the new tools
              const updatedAgent = {
                ...defaultAgent,
                toolReferences: [...currentToolReferences, ...toolsToAdd],
              };

              await saveAgent(updatedAgent);
              console.log(
                `Added ${toolsToAdd.length} tools from ${app.name} to DefaultAssistant agent:`,
                toolsToAdd.map((ref) => ref.toolName),
              );
              toast.success(
                `Enabled ${toolsToAdd.length} tools from ${app.name} for DefaultAssistant`,
              );
            }
          }
        } catch (toolError) {
          console.error(`Failed to get tools for app ${app.name}:`, toolError);
          // Don't show error toast here as the main connection was successful
        }
      }
    } catch (error) {
      console.error("Failed to update DefaultAssistant with app tools:", error);
      // Don't show error toast here as the main connection was successful
    }
  },

  // Function to remove disconnected app's tools from DefaultAssistant agent
  removeAppToolsFromDefaultAssistant: async (app: ConnectedApp) => {
    try {
      const { fetchAgents, saveAgent } = useAgentStore.getState();

      // Fetch latest agents to ensure we have current data
      await fetchAgents();

      // Find the DefaultAssistant agent
      const defaultAgent = useAgentStore
        .getState()
        .availableAgents.find(
          (agent: Agent) => agent.id === "DefaultAssistant",
        );

      if (!defaultAgent) {
        console.warn("DefaultAssistant agent not found");
        return;
      }

      // Get current tool references
      const currentToolReferences = defaultAgent.toolReferences || [];

      // Filter out tools from the disconnected app
      const filteredToolReferences = currentToolReferences.filter(
        (ref: ToolReference) => ref.mcpName !== app.id,
      );

      // Only update if there were tools to remove
      if (filteredToolReferences.length < currentToolReferences.length) {
        const removedCount =
          currentToolReferences.length - filteredToolReferences.length;

        // Update the agent with the filtered tools
        const updatedAgent = {
          ...defaultAgent,
          toolReferences: filteredToolReferences,
        };

        await saveAgent(updatedAgent);
        console.log(
          `Removed ${removedCount} tools from ${app.name} from DefaultAssistant agent`,
        );
        toast.success(
          `Removed ${removedCount} tools from ${app.name} from DefaultAssistant`,
        );
      }
    } catch (error) {
      console.error("Failed to remove app tools from DefaultAssistant:", error);
      // Don't show error toast here as the main disconnection was successful
    }
  },
}));
