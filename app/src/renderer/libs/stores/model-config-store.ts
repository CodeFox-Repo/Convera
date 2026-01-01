/**
 * Model Config Store - Dexie 版本
 *
 * 完全本地存储
 * 使用 Dexie liveQuery 实现实时数据更新和多窗口同步
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
  FOXYCHAT_CONFIG_ID,
  DEFAULT_FOXYCHAT_MODELS,
} from "../db";
import { useSelectionStore } from "../db/ui-state";

// Re-export for backward compatibility
export type { ModelConfig };
export { FOXYCHAT_CONFIG_ID };

interface GroupedModel {
  configId: string;
  configName: string;
  modelId: string;
  isRemote: boolean;
}

// ==================== Hooks ====================

/**
 * 主要的 Model Config store hook
 * 替代旧的 useModelConfigStore
 */
export function useModelConfigStore() {
  const modelConfigs = useModelConfigs();
  const { selectedConfigId, selectedModelId, setSelectedModel } = useSelectionStore();
  const currentConfig = useModelConfig(selectedConfigId);

  return {
    // State
    modelConfigs: modelConfigs || [],
    selectedConfigId,
    selectedModelId,

    // Actions
    addModelConfig: async (config: Omit<ModelConfig, "id">) => {
      const id = await createConfigDB(config);
      return id;
    },

    updateModelConfig: async (id: string, updates: Partial<Omit<ModelConfig, "id">>) => {
      await updateConfigDB(id, updates);
    },

    removeModelConfig: async (id: string) => {
      await deleteConfigDB(id);

      // If removing the selected config, switch to foxychat remote
      if (selectedConfigId === id) {
        setSelectedModel(FOXYCHAT_CONFIG_ID, DEFAULT_FOXYCHAT_MODELS[0]);
      }
    },

    setSelectedModel: (configId: string, modelId: string) => {
      setSelectedModel(configId, modelId);

      // Dispatch events for other components
      window.dispatchEvent(
        new CustomEvent("model-config-selected", {
          detail: { configId, modelId },
        })
      );

      window.dispatchEvent(
        new CustomEvent("model-selected", {
          detail: { modelId },
        })
      );
    },

    // Helpers
    getAvailableModels: (isUserLoggedIn: boolean): GroupedModel[] => {
      const models: GroupedModel[] = [];

      // Foxychat 远程模型（需登录）
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

      // 用户自定义模型
      (modelConfigs || []).forEach((config) => {
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

    getConfigById: (id: string): ModelConfig | undefined => {
      if (id === FOXYCHAT_CONFIG_ID) {
        return undefined;
      }
      return (modelConfigs || []).find((config) => config.id === id);
    },

    getCurrentConfig: (): ModelConfig | undefined => {
      if (selectedConfigId === FOXYCHAT_CONFIG_ID) {
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
 * Hook 版本的 getAvailableModels
 */
export { useAvailableModels };

// ==================== Static State Access (for non-React contexts) ====================

/**
 * 用于非 React 上下文中获取状态
 * 兼容旧的 useModelConfigStore.getState() 调用模式
 */
useModelConfigStore.getState = () => {
  const { selectedConfigId, selectedModelId } = useSelectionStore.getState();

  return {
    selectedConfigId,
    selectedModelId,
    getCurrentConfig: async (): Promise<ModelConfig | undefined> => {
      if (selectedConfigId === FOXYCHAT_CONFIG_ID) {
        return undefined;
      }
      return await db.modelConfigs.get(selectedConfigId);
    },
    getConfigById: async (id: string): Promise<ModelConfig | undefined> => {
      if (id === FOXYCHAT_CONFIG_ID) {
        return undefined;
      }
      return await db.modelConfigs.get(id);
    },
  };
};

// ==================== Standalone Actions ====================

/**
 * 创建模型配置（不需要 hook）
 */
export async function createModelConfig(config: Omit<ModelConfig, "id">): Promise<string> {
  return await createConfigDB(config);
}

/**
 * 更新模型配置（不需要 hook）
 */
export async function updateModelConfig(
  id: string,
  updates: Partial<Omit<ModelConfig, "id">>
): Promise<void> {
  await updateConfigDB(id, updates);
}

/**
 * 删除模型配置（不需要 hook）
 */
export async function deleteModelConfig(id: string): Promise<void> {
  await deleteConfigDB(id);
}

/**
 * 从 API 端点获取可用模型
 */
export async function fetchModelsFromEndpoint(
  endpoint: string,
  apiKey: string
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
