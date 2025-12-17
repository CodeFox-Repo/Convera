import { useModelStore } from "@/renderer/libs/stores/model-store";
import * as Popover from "@radix-ui/react-popover";
import React, { useEffect, useState } from "react";

export default function ModelSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    selectedModelId,
    setSelectedModelId,
    subscribeToModelChanges,
    supportedModelIds,
  } = useModelStore();

  useEffect(() => {
    const unsubscribe = subscribeToModelChanges();
    return unsubscribe;
  }, [subscribeToModelChanges]);

  const formatModelName = (modelId: string) => {
    return modelId.split("/").pop() || modelId;
  };

  const handleModelSelect = (model: string) => {
    setSelectedModelId(model);
    setIsOpen(false);
  };

  if (selectedModelId.length === 0) {
    return null;
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button className="no-drag-region bg-primary/20 text-primary hover:bg-primary/30 flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium">
          {formatModelName(selectedModelId)}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="w-[280px] bg-popover border border-border rounded-xl shadow-lg z-50"
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
            <h3 className="font-medium text-sm text-foreground">Select Model</h3>
          </div>

          {/* Model list */}
          <div className="max-h-64 overflow-y-auto p-2">
            <div className="space-y-1">
              {supportedModelIds.map((model) => (
                <button
                  key={model}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all ${
                    model === selectedModelId
                      ? "bg-primary/20 border border-primary/20"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => handleModelSelect(model)}
                >
                  <span className="truncate text-foreground">{model}</span>
                  {model === selectedModelId && (
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
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
