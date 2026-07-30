/**
 * Model Config Store - Dexie Version
 *
 * Fully local storage
 * Uses Dexie liveQuery for real-time data updates and multi-window sync
 */

import {
  useModelConfigs,
  useModelConfig,
  useAvailableModels,
  createModelConfig as createConfigDB,
  updateModelConfig as updateConfigDB,
  deleteModelConfig as deleteConfigDB,
  db,
  type ModelConfig,
} from "../db";
import { useSelectionStore } from "../db/ui-state";
import {
  DEFAULT_LOCAL_AI_MODEL_ID,
  DEFAULT_LOCAL_AI_PROVIDER_ID,
  LOCAL_AI_PROVIDER_NAMES,
  isLocalAIProviderId,
  type LocalAIProviderId,
} from "../local-ai";
import { resolveNativeProviderSelection } from "../provider-selection";

// Re-export for backward compatibility
export type { ModelConfig };
export { DEFAULT_LOCAL_AI_PROVIDER_ID };

interface GroupedModel {
  configId: string;
  configName: string;
  modelId: string;
  isRemote: boolean;
}

// ==================== Hooks ====================

/**
 * Main Model Config store hook
 * Replaces the old useModelConfigStore
 */
export function useModelConfigStore() {
  const modelConfigs = useModelConfigs();
  const {
    selectedConfigId,
    selectedModelId,
    defaultConfigId,
    defaultModelId,
    setSelectedModel,
    setDefaultModel,
  } = useSelectionStore();
  const currentConfig = useModelConfig(selectedConfigId);

  return {
    // State
    modelConfigs: modelConfigs || [],
    selectedConfigId,
    selectedModelId,
    defaultConfigId,
    defaultModelId,

    // Actions
    addModelConfig: async (config: Omit<ModelConfig, "id">) => {
      const id = await createConfigDB(config);
      return id;
    },

    updateModelConfig: async (
      id: string,
      updates: Partial<Omit<ModelConfig, "id">>,
    ) => {
      await updateConfigDB(id, updates);
    },

    removeModelConfig: async (id: string) => {
      await deleteConfigDB(id);

      // If removing the selected config, switch to the default local provider
      if (selectedConfigId === id) {
        setSelectedModel(
          DEFAULT_LOCAL_AI_PROVIDER_ID,
          DEFAULT_LOCAL_AI_MODEL_ID,
        );
      }
    },

    setSelectedModel: (configId: string, modelId: string) => {
      setSelectedModel(configId, modelId);

      // Dispatch events for other components
      window.dispatchEvent(
        new CustomEvent("model-config-selected", {
          detail: { configId, modelId },
        }),
      );

      window.dispatchEvent(
        new CustomEvent("model-selected", {
          detail: { modelId },
        }),
      );
    },
    setDefaultModel: (configId: string, modelId: string) => {
      setDefaultModel(configId, modelId);
    },

    // Helpers
    getAvailableModels: (): GroupedModel[] => {
      const models: GroupedModel[] = [];

      Object.entries(LOCAL_AI_PROVIDER_NAMES).forEach(
        ([configId, configName]) => {
          models.push({
            configId,
            configName,
            modelId: DEFAULT_LOCAL_AI_MODEL_ID,
            isRemote: false,
          });
        },
      );

      return models;
    },

    getConfigById: (id: string): ModelConfig | undefined => {
      if (isLocalAIProviderId(id)) {
        return undefined;
      }
      return (modelConfigs || []).find((config) => config.id === id);
    },

    getCurrentConfig: (): ModelConfig | undefined => {
      if (isLocalAIProviderId(selectedConfigId)) {
        return undefined;
      }
      return currentConfig;
    },

    subscribeToModelConfigChanges: () => {
      // No-op, Dexie liveQuery handles reactivity
      return () => {};
    },
  };
}

/**
 * Hook version of getAvailableModels
 */
export { useAvailableModels };

// ==================== Static State Access (for non-React contexts) ====================

/**
 * For accessing state in non-React contexts
 * Compatible with the old useModelConfigStore.getState() calling pattern
 */
useModelConfigStore.getState = () => {
  const { selectedConfigId, selectedModelId, defaultConfigId, defaultModelId } =
    useSelectionStore.getState();

  return {
    selectedConfigId,
    selectedModelId,
    defaultConfigId,
    defaultModelId,
    getCurrentConfig: async (): Promise<ModelConfig | undefined> => {
      if (isLocalAIProviderId(selectedConfigId)) {
        return undefined;
      }
      return await db.modelConfigs.get(selectedConfigId);
    },
    getConfigById: async (id: string): Promise<ModelConfig | undefined> => {
      if (isLocalAIProviderId(id)) {
        return undefined;
      }
      return await db.modelConfigs.get(id);
    },
  };
};

export function resolveLocalAIProviderId(configId: string): LocalAIProviderId {
  return resolveNativeProviderSelection(configId, undefined)
    .configId as LocalAIProviderId;
}

// ==================== Standalone Actions ====================

/**
 * Create model config (without hook)
 */
export async function createModelConfig(
  config: Omit<ModelConfig, "id">,
): Promise<string> {
  return await createConfigDB(config);
}

/**
 * Update model config (without hook)
 */
export async function updateModelConfig(
  id: string,
  updates: Partial<Omit<ModelConfig, "id">>,
): Promise<void> {
  await updateConfigDB(id, updates);
}

/**
 * Delete model config (without hook)
 */
export async function deleteModelConfig(id: string): Promise<void> {
  await deleteConfigDB(id);
}

/**
 * Fetch available models from API endpoint
 */
export async function fetchModelsFromEndpoint(
  endpoint: string,
  apiKey: string,
): Promise<string[]> {
  // Normalize endpoint and build models URL
  const normalizedEndpoint = endpoint.replace(/\/+$/, "");
  const modelsUrl = normalizedEndpoint.endsWith("/v1")
    ? `${normalizedEndpoint}/models`
    : `${normalizedEndpoint}/v1/models`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

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

  if (data.data && Array.isArray(data.data)) {
    return data.data.map((model: { id: string }) => model.id);
  }

  throw new Error("Unexpected response format from models endpoint");
}
