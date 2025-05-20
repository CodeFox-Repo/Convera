import { useModelStore } from "@/renderer/libs/stores/model-store";
import { getSettings } from "@/renderer/libs/utils/settings";
import { Check, ChevronDown } from "lucide-react";
import React, { useEffect, useState } from "react";


export default function ModelSelector() {
  console.log("Model from localStorage:" +   localStorage.getItem("selectedModelId") );
  const [isOpen, setIsOpen] = useState(false);
  const [supportedModels, setSupportedModels] = useState<string[]>([]);

  const { selectedModelId, setSelectedModelId: setModel } = useModelStore();

  const setSelectedModelId = (modelId: string) => {
    setModel(modelId);
    if (window.electronAPI) {
      window.electronAPI.toggleModelSelector();
      // Dispatch a custom event that will be caught by the main window
      window.opener?.dispatchEvent(
        new CustomEvent("model-selected", {
          detail: { modelId },
        }),
      );
    }  }
  /**
   * Load supported models from localStorage or settings
   */
  const loadSupportedModels = () => {
    try {
      const models = JSON.parse(localStorage.getItem("supportedModels") || "[]");
      if (models && models.length) {
        setSupportedModels(models);
        return;
      }
    } catch (error) {
      console.error("Error loading models from localStorage:", error);
    }
    
    const settings = getSettings();
    setSupportedModels(settings.openai.supportedModels || []);
  };

  /**
   * Initialize model list and set up event listeners for updates
   */
  useEffect(() => {
    loadSupportedModels();
    
    const onStorage = (e: StorageEvent) => {
      if (e.key === "supportedModels") {
        loadSupportedModels();
      }
    };
    
    const onCustomEvent = () => {
      loadSupportedModels();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("supportedModels-updated", onCustomEvent);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("supportedModels-updated", onCustomEvent);
    };
  }, []);



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
   * Handle model selection and notify parent components
   */
  const handleModelSelect = (model: string) => {
    setSelectedModelId(model);
    localStorage.setItem("selectedModelId", model);

    // Try to communicate with opener window if it exists
    if (window.opener) {
      try {
        window.opener.dispatchEvent(
          new CustomEvent("model-selected", {
            detail: { modelId: model },
          })
        );
      } catch (error) {
        console.error("Error communicating with opener window:", error);
      }
    }

    // Use IPC if available
    if (window.electronAPI) {
      try {
        window.electronAPI.modelSelected(model);
        window.electronAPI.toggleModelSelector();
      } catch (error) {
        console.error("Error using IPC for model selection:", error);
      }
    }

    setIsOpen(false);
  };

  const isPopover =
    window.location.hash === "#model-selector" ||
    new URLSearchParams(window.location.search).get("view") === "model-selector";

  if (isPopover) {
    return (
      <div className="model-selector-popover bg-background border-border rounded-md border p-2 shadow-lg">
        <div className="mb-2 text-xs font-medium text-black dark:text-white">
          Select Model
        </div>
        <div className="max-h-[220px] overflow-y-auto">
          {supportedModels.map((model) => (
            <button
              key={model}
              className={`hover:bg-primary/10 flex w-full items-center justify-between rounded px-2 py-1.5 text-xs ${
                model === selectedModelId
                  ? "bg-primary/20 text-primary"
                  : "text-foreground"
              }`}
              onClick={() => handleModelSelect(model)}
            >
              <span>{formatModelName(model)}</span>
              {model === selectedModelId && <Check size={12} />}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="model-selector-container relative">
      <button
        className="bg-primary/20 text-primary hover:bg-primary/30 flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
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

                console.log(
                  `Model selector button position: window(${winX},${winY}) + local(${rect.left},${rect.bottom}) = abs(${absX},${absY})`
                );

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
        <ChevronDown
          size={12}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && !window.electronAPI && (
        <div className="border-border bg-background absolute top-full left-0 z-10 mt-1 w-40 rounded-md border p-1 shadow-lg">
          {supportedModels.map((model) => (
            <button
              key={model}
              className={`hover:bg-primary/10 flex w-full items-center justify-between rounded px-2 py-1.5 text-xs ${
                model === selectedModelId
                  ? "bg-primary/20 text-primary"
                  : "text-foreground"
              }`}
              onClick={() => handleModelSelect(model)}
            >
              <span>{formatModelName(model)}</span>
              {model === selectedModelId && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
