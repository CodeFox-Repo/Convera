import { useThemeSync } from "@/renderer/libs/hooks/use-theme-sync";
import { useModelStore } from "@/renderer/libs/stores/model-store";
import { Check } from "lucide-react";
import React, { useEffect, useState } from "react";

export default function ModelSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    selectedModelId,
    setSelectedModelId,
    subscribeToModelChanges,
    supportedModelIds,
  } = useModelStore();

  console.log("selectedModelId", selectedModelId);
  const ITEM_HEIGHT = 32;
  const POPUP_PADDING = 8;
  const MAX_HEIGHT = 220;
  const computedHeight = Math.min(
    supportedModelIds.length * ITEM_HEIGHT + POPUP_PADDING,
    MAX_HEIGHT,
  );

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

  /**
   * Handle clicks outside the dropdown to close it
   */
  useEffect(() => {
    if (!isOpen) return;

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
  }, [isOpen]);

  const formatModelName = (modelId: string) => {
    return modelId.split("/").pop() || modelId;
  };

  /**
   * Handle model selection
   */
  const handleModelSelect = (model: string) => {
    setSelectedModelId(model);
    setIsOpen(false);
  };

  if (isPopover) {
    return (
      <div className="model-selector-popover bg-background border-border rounded-md border p-2 shadow-lg">
        <div className="mb-2 text-xs font-medium text-black dark:text-white">
          Select Model
        </div>
        <div className="max-h-[220px] overflow-y-auto">
          {supportedModelIds.map((model) => (
            <button
              key={model}
              className={`hover:bg-primary/10 flex w-full items-center justify-between rounded px-2 py-1.5 text-xs ${
                model === selectedModelId
                  ? "bg-primary/20 text-primary"
                  : "text-foreground"
              }`}
              onClick={() => handleModelSelect(model)}
            >
              <span>{model}</span>
              {model === selectedModelId && <Check size={12} />}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return selectedModelId.length > 0 ? (
    <div className="model-selector-container relative">
      <button
        onClick={(e) => {
          if (!window.electronAPI) {
            setIsOpen(!isOpen);
            return;
          }

          e.stopPropagation();
          const button = e.currentTarget;
          const rect = button.getBoundingClientRect();

          const dpr = window.devicePixelRatio || 1;
          const contentRight = rect.right * dpr;
          const contentTop = rect.top * dpr;

          window.electronAPI
            .getCurrentWindowPosition()
            .then(({ x: winX, y: winY }) => {
              const px = winX + contentRight;
              const py = winY + contentTop;

              const absX = Math.round(px);
              const absY = Math.round(py - computedHeight);

              window.electronAPI.toggleModelSelector(
                absX,
                absY,
                280,
                200,
              );
            })
            .catch((err: Error) => {
              console.error("Failed to get window position:", err);
              setIsOpen(!isOpen);
            });
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
