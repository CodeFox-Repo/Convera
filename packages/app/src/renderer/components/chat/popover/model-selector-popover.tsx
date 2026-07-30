import { useLocalAIProviders } from "@/renderer/libs/hooks/use-local-ai-providers";
import {
  DEFAULT_LOCAL_AI_MODEL_ID,
  isLocalAIProviderId,
} from "@/renderer/libs/local-ai";
import { useModelConfigStore } from "@/renderer/libs/stores/model-config-store";
import * as Popover from "@radix-ui/react-popover";
import { Key, Terminal } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

export default function ModelSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    selectedModelId,
    selectedConfigId,
    setSelectedModel,
    getAvailableModels,
    subscribeToModelConfigChanges,
  } = useModelConfigStore();

  const { providers } = useLocalAIProviders();

  useEffect(() => {
    const unsubscribe = subscribeToModelConfigChanges();
    return unsubscribe;
  }, [subscribeToModelConfigChanges]);

  // Get all available models grouped by config
  const availableModels = useMemo(() => {
    const configuredModels = getAvailableModels();
    return configuredModels.flatMap((model) => {
      if (!isLocalAIProviderId(model.configId)) return model;
      const provider = providers.find(
        (candidate) => candidate.id === model.configId,
      );
      const models =
        provider?.models && provider.models.length > 0
          ? provider.models
          : [
              {
                id: DEFAULT_LOCAL_AI_MODEL_ID,
                name: DEFAULT_LOCAL_AI_MODEL_ID,
              },
            ];
      return models.map((providerModel) => ({
        ...model,
        modelId: providerModel.id,
      }));
    });
  }, [getAvailableModels, providers]);

  // Group models by configId
  const groupedModels = useMemo(() => {
    const groups: Record<
      string,
      { configName: string; isRemote: boolean; models: string[] }
    > = {};

    availableModels.forEach((model) => {
      if (!groups[model.configId]) {
        groups[model.configId] = {
          configName: model.configName,
          isRemote: model.isRemote,
          models: [],
        };
      }
      groups[model.configId].models.push(model.modelId);
    });

    return groups;
  }, [availableModels]);

  const formatModelName = (modelId: string) => {
    return modelId.split("/").pop() || modelId;
  };

  const handleModelSelect = (configId: string, modelId: string) => {
    setSelectedModel(configId, modelId);
    setIsOpen(false);
  };

  // Find current selected model display name
  const selectedDisplayName = useMemo(() => {
    if (selectedModelId === DEFAULT_LOCAL_AI_MODEL_ID) {
      return "Auto";
    }
    return formatModelName(selectedModelId);
  }, [selectedModelId]);

  if (availableModels.length === 0) {
    return null;
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button className="no-drag-region bg-primary/20 text-primary hover:bg-primary/30 flex items-center gap-1 rounded-xs px-2 py-0.5 text-xs font-medium">
          {selectedDisplayName}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="w-[320px] bg-popover border border-border rounded-xl shadow-lg z-50"
          side="bottom"
          align="start"
          sideOffset={8}
        >
          {/* Header */}
          <div className="flex items-center gap-2 p-3 border-b border-border">
            <svg
              className="w-4 h-4 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <h3 className="font-medium text-sm text-foreground">
              Select Model
            </h3>
          </div>

          {/* Grouped Model list */}
          <div className="max-h-80 overflow-y-auto p-2">
            {Object.entries(groupedModels).map(([configId, group]) => (
              <div key={configId} className="mb-3 last:mb-0">
                {/* Group Header */}
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                  {isLocalAIProviderId(configId) ? (
                    <Terminal className="w-3 h-3" />
                  ) : (
                    <Key className="w-3 h-3 text-orange-500" />
                  )}
                  <span className="font-medium">{group.configName}</span>
                </div>

                {/* Models in group */}
                <div className="space-y-0.5">
                  {group.models.map((modelId) => {
                    const isSelected =
                      configId === selectedConfigId &&
                      modelId === selectedModelId;

                    return (
                      <button
                        key={`${configId}-${modelId}`}
                        className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all ${
                          isSelected
                            ? "bg-primary/20 border border-primary/20"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => handleModelSelect(configId, modelId)}
                      >
                        <span className="truncate text-foreground">
                          {modelId}
                        </span>
                        {isSelected && (
                          <svg
                            className="w-4 h-4 text-primary flex-shrink-0 ml-2"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Empty state */}
            {Object.keys(groupedModels).length === 0 && (
              <div className="py-8 text-center">
                <p className="text-muted-foreground text-sm">
                  No models available
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Install and sign in to Claude Code or Codex
                </p>
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
