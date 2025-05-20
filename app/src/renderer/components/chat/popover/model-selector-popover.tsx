import { useModelStore } from "@/renderer/libs/stores/model-store";
import { Check } from "lucide-react";
import React, { useEffect, useState } from "react";


export default function ModelSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedModelId, setSelectedModelId, subscribeToModelChanges, supportedModelIds } = useModelStore();

  useEffect(() => {
    const unsubscribe = subscribeToModelChanges();
    return unsubscribe;
  }, []);


  const isPopover =
    window.location.hash === "#model-selector" ||
    new URLSearchParams(window.location.search).get("view") === "model-selector";

  
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
          className="no-drag-region bg-primary/20 text-primary hover:bg-primary/30 flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
        onClick={(e) => {
          if (window.electronAPI) {
            e.stopPropagation();
            const button = e.currentTarget;
            const rect = button.getBoundingClientRect();
            window.electronAPI
              .getCurrentWindowPosition()
              .then(({ x: winX, y: winY }: { x: number; y: number }) => {
                const absX = Math.round(winX + rect.left + 50);
                const absY = Math.round(winY + rect.bottom - 200);
                const width = 200;
                const height = 250;
                window.electronAPI.toggleModelSelector(absX, absY, width, height);
              })
              .catch((err: Error) => {
                console.error("Failed to get window position:", err);
                setIsOpen(!isOpen);
              });
          } else {
            setIsOpen(!isOpen);
          }
        }}
      >
        {formatModelName(selectedModelId)}
      </button>
    </div>
  ) : <></>
}
