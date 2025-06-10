import { MCPConfig } from "@/shared/types/settings";
import { toast } from "sonner";
import { create } from "zustand";
import { useAgentStore } from "./agent-store";
import { useMcpStore } from "./mcp-store";

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

        // Update DefaultAssistant agent with new app's tools using consolidated function
        if (app.mcpConfig) {
          const { addToolsToDefaultAssistant } = useAgentStore.getState();
          const { getMcpServerTools } = useMcpStore.getState();

          await addToolsToDefaultAssistant(
            app.id,
            app.name,
            () => getMcpServerTools(app.id),
            "app tools",
          );
        }

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

        // Remove app's tools from DefaultAssistant agent using consolidated function
        const { removeToolsFromDefaultAssistant } = useAgentStore.getState();
        await removeToolsFromDefaultAssistant(app.id, app.name, "app tools");

        onSuccess?.();
      } else {
        throw new Error(result.error || "Failed to disconnect app");
      }
    } catch (error) {
      console.error(`Error disconnecting from ${app.name}:`, error);
      toast.error(`Failed to disconnect from ${app.name}`);
    }
  },
}));
