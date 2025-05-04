import React, { useState, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { getSettings } from "@/utils/settings";

interface ModelSelectorProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
}

export default function ModelSelector({
  selectedModel,
  onSelectModel,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [supportedModels, setSupportedModels] = useState<string[]>([]);
  const [currentModel, setCurrentModel] = useState(selectedModel);

  // 封装加载模型列表的逻辑
  const loadSupportedModels = () => {
    // 优先从 localStorage 取
    try {
      const models = JSON.parse(localStorage.getItem("supportedModels") || "[]");
      if (models && models.length) {
        setSupportedModels(models);
        return;
      }
    } catch (error) {
      console.error("Error loading models from localStorage:", error);
    }
    
    // Fallback: 从 settings 取
    const settings = getSettings();
    setSupportedModels(settings.openai.supportedModels || []);
  };

  // 初始加载模型列表
  useEffect(() => {
    loadSupportedModels();
    
    // 监听 localStorage 变化（跨 tab）
    const onStorage = (e: StorageEvent) => {
      if (e.key === "supportedModels") {
        loadSupportedModels();
      }
    };
    
    // 监听自定义事件（同 tab）
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

  // Update internal state when prop changes
  useEffect(() => {
    setCurrentModel(selectedModel);
  }, [selectedModel]);

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

  const handleModelSelect = (model: string) => {
    setCurrentModel(model);
    onSelectModel(model);
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
                model === currentModel
                  ? "bg-primary/20 text-primary"
                  : "text-foreground"
              }`}
              onClick={() => handleModelSelect(model)}
            >
              <span>{formatModelName(model)}</span>
              {model === currentModel && <Check size={12} />}
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
        {formatModelName(currentModel)}
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
                model === currentModel
                  ? "bg-primary/20 text-primary"
                  : "text-foreground"
              }`}
              onClick={() => handleModelSelect(model)}
            >
              <span>{formatModelName(model)}</span>
              {model === currentModel && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
