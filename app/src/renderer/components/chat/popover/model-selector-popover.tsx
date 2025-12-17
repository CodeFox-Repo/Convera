import { useThemeSync } from "@/renderer/libs/hooks/use-theme-sync";
import { useModelStore } from "@/renderer/libs/stores/model-store";
import React, { useEffect, useState } from "react";

export default function ModelSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    selectedModelId,
    setSelectedModelId,
    subscribeToModelChanges,
    supportedModelIds,
  } = useModelStore();

  // Listen for theme changes from settings
  useThemeSync();

  useEffect(() => {
    const unsubscribe = subscribeToModelChanges();
    return unsubscribe;
  }, []);

  const isPopover =
    window.location.hash === "#model-selector" ||
    new URLSearchParams(window.location.search).get("view") ===
      "model-selector";

  // Click outside and ESC key handling is managed by parent Popover component

  /**
   * Handle clicks outside the dropdown to close it (for non-popover mode)
   */
  useEffect(() => {
    if (!isOpen || isPopover) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".model-selector-container")) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, isPopover]);

  const formatModelName = (modelId: string) => {
    return modelId.split("/").pop() || modelId;
  };

  /**
   * Get appropriate height class based on number of models
   */
  const getHeightClass = () => {
    const modelCount = supportedModelIds.length;
    if (modelCount <= 2) return "h-40"; // 160px
    if (modelCount <= 4) return "h-52"; // 208px
    if (modelCount <= 6) return "h-64"; // 256px
    return "h-80"; // 320px
  };

  /**
   * Handle model selection
   */
  const handleModelSelect = (model: string) => {
    setSelectedModelId(model);
    setIsOpen(false);

    // Popover closes automatically via parent component
  };

  if (isPopover) {
    return (
      <div className="relative">
        <div
          className={`bg-background border-border w-[280px] rounded-xl border shadow-lg flex flex-col ${getHeightClass()}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
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
          </div>

          {/* Scrollable model list */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="space-y-1">
              {supportedModelIds.map((model) => (
                <button
                  key={model}
                  className={`hover:bg-primary/10 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
                    model === selectedModelId
                      ? "bg-primary/20 border border-primary/20"
                      : "hover:bg-muted/30"
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
        </div>
      </div>
    );
  }

  return selectedModelId.length > 0 ? (
    <div className="model-selector-container relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="no-drag-region bg-primary/20 text-primary hover:bg-primary/30 flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
      >
        {formatModelName(selectedModelId)}
      </button>
    </div>
  ) : (
    <></>
  );
}
