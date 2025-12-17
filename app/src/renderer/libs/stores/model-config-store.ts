import { FOXYCHAT_CONFIG_ID, ModelConfig } from "@/shared/types/settings";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// Default models available via Foxychat remote server
const DEFAULT_FOXYCHAT_MODELS = [
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "qwen/qwq-32b",
  "anthropic/claude-3.7-sonnet",
  "openai/o3-mini",
];

interface GroupedModel {
  configId: string;
  configName: string;
  modelId: string;
  isRemote: boolean;
}

interface ModelConfigState {
  // State
  modelConfigs: ModelConfig[];
  selectedConfigId: string;
  selectedModelId: string;

  // Actions
  addModelConfig: (config: Omit<ModelConfig, "id">) => string;
  updateModelConfig: (
    id: string,
    updates: Partial<Omit<ModelConfig, "id">>,
  ) => void;
  removeModelConfig: (id: string) => void;
  setSelectedModel: (configId: string, modelId: string) => void;

  // Helpers
  getAvailableModels: (isUserLoggedIn: boolean) => GroupedModel[];
  getConfigById: (id: string) => ModelConfig | undefined;
  getCurrentConfig: () => ModelConfig | undefined;

  // Cross-window sync
  subscribeToModelConfigChanges: () => () => void;
}

const generateConfigId = () =>
  `config-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

export const useModelConfigStore = create<ModelConfigState>()(
  persist(
    (set, get) => ({
      modelConfigs: [],
      selectedConfigId: FOXYCHAT_CONFIG_ID, // Default to remote
      selectedModelId: DEFAULT_FOXYCHAT_MODELS[0],

      addModelConfig: (config) => {
        const id = generateConfigId();
        const newConfig: ModelConfig = { ...config, id };

        set((state) => ({
          modelConfigs: [...state.modelConfigs, newConfig],
        }));

        // Dispatch event for cross-window sync
        localStorage.setItem(
          "foxchat_model_configs",
          JSON.stringify([...get().modelConfigs]),
        );
        window.dispatchEvent(new CustomEvent("model-configs-updated"));

        return id;
      },

      updateModelConfig: (id, updates) => {
        set((state) => ({
          modelConfigs: state.modelConfigs.map((config) =>
            config.id === id ? { ...config, ...updates } : config,
          ),
        }));

        localStorage.setItem(
          "foxchat_model_configs",
          JSON.stringify(get().modelConfigs),
        );
        window.dispatchEvent(new CustomEvent("model-configs-updated"));
      },

      removeModelConfig: (id) => {
        const { selectedConfigId, modelConfigs } = get();

        // If removing the selected config, switch to foxychat remote
        const newSelectedConfigId =
          selectedConfigId === id ? FOXYCHAT_CONFIG_ID : selectedConfigId;
        const newSelectedModelId =
          selectedConfigId === id
            ? DEFAULT_FOXYCHAT_MODELS[0]
            : get().selectedModelId;

        set({
          modelConfigs: modelConfigs.filter((config) => config.id !== id),
          selectedConfigId: newSelectedConfigId,
          selectedModelId: newSelectedModelId,
        });

        localStorage.setItem(
          "foxchat_model_configs",
          JSON.stringify(get().modelConfigs),
        );
        window.dispatchEvent(new CustomEvent("model-configs-updated"));
      },

      setSelectedModel: (configId, modelId) => {
        set({ selectedConfigId: configId, selectedModelId: modelId });

        localStorage.setItem("foxchat_selected_config", configId);
        localStorage.setItem("foxchat_selected_model", modelId);

        // Also update legacy selectedModelId for backward compatibility
        localStorage.setItem("selectedModelId", modelId);

        window.dispatchEvent(
          new CustomEvent("model-config-selected", {
            detail: { configId, modelId },
          }),
        );

        // Also dispatch legacy event
        window.dispatchEvent(
          new CustomEvent("model-selected", {
            detail: { modelId },
          }),
        );
      },

      getAvailableModels: (isUserLoggedIn) => {
        const { modelConfigs } = get();
        const models: GroupedModel[] = [];

        // Add Foxychat remote models if user is logged in
        if (isUserLoggedIn) {
          DEFAULT_FOXYCHAT_MODELS.forEach((modelId) => {
            models.push({
              configId: FOXYCHAT_CONFIG_ID,
              configName: "Foxychat",
              modelId,
              isRemote: true,
            });
          });
        }

        // Add custom config models
        modelConfigs.forEach((config) => {
          config.models.forEach((modelId) => {
            models.push({
              configId: config.id,
              configName: config.name,
              modelId,
              isRemote: false,
            });
          });
        });

        return models;
      },

      getConfigById: (id) => {
        if (id === FOXYCHAT_CONFIG_ID) {
          return undefined; // Foxychat remote doesn't have a ModelConfig object
        }
        return get().modelConfigs.find((config) => config.id === id);
      },

      getCurrentConfig: () => {
        const { selectedConfigId, modelConfigs } = get();
        if (selectedConfigId === FOXYCHAT_CONFIG_ID) {
          return undefined;
        }
        return modelConfigs.find((config) => config.id === selectedConfigId);
      },

      subscribeToModelConfigChanges: () => {
        const configUpdatedHandler = () => {
          const savedConfigs = localStorage.getItem("foxchat_model_configs");
          if (savedConfigs) {
            try {
              const configs = JSON.parse(savedConfigs);
              set({ modelConfigs: configs });
            } catch (error) {
              console.error("Error parsing model configs from storage:", error);
            }
          }
        };

        const storageHandler = (event: StorageEvent) => {
          if (event.key === "foxchat_model_configs" && event.newValue) {
            try {
              const configs = JSON.parse(event.newValue);
              set({ modelConfigs: configs });
            } catch (error) {
              console.error("Error parsing model configs from storage:", error);
            }
          }

          if (event.key === "foxchat_selected_config" && event.newValue) {
            set({ selectedConfigId: event.newValue });
          }

          if (event.key === "foxchat_selected_model" && event.newValue) {
            set({ selectedModelId: event.newValue });
          }
        };

        window.addEventListener(
          "model-configs-updated",
          configUpdatedHandler as EventListener,
        );
        window.addEventListener("storage", storageHandler as EventListener);

        return () => {
          window.removeEventListener(
            "model-configs-updated",
            configUpdatedHandler as EventListener,
          );
          window.removeEventListener(
            "storage",
            storageHandler as EventListener,
          );
        };
      },
    }),
    {
      name: "model-config-storage",
      partialize: (state) => ({
        modelConfigs: state.modelConfigs,
        selectedConfigId: state.selectedConfigId,
        selectedModelId: state.selectedModelId,
      }),
    },
  ),
);

/**
 * Fetch available models from an OpenAI-compatible API endpoint
 */
export async function fetchModelsFromEndpoint(
  endpoint: string,
  apiKey: string,
): Promise<string[]> {
  // Normalize endpoint and build models URL
  const normalizedEndpoint = endpoint.replace(/\/+$/, ""); // Remove trailing slashes
  const modelsUrl = normalizedEndpoint.endsWith("/v1")
    ? `${normalizedEndpoint}/models`
    : `${normalizedEndpoint}/v1/models`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Only add Authorization header if apiKey is provided
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(modelsUrl, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();

  // OpenAI-compatible API returns { data: [{ id: "model-id", ... }] }
  if (data.data && Array.isArray(data.data)) {
    return data.data.map((model: { id: string }) => model.id);
  }

  throw new Error("Unexpected response format from models endpoint");
}
