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

  useEffect(() => {
    const settings = getSettings();
    setSupportedModels(settings.openai.supportedModels || []);
  }, []);

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

  const isPopover =
    window.location.hash === "#model-selector" ||
    new URLSearchParams(window.location.search).get("view") ===
      "model-selector";

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
                model === selectedModel
                  ? "bg-primary/20 text-primary"
                  : "text-foreground"
              }`}
              onClick={() => {
                onSelectModel(model);

                // Communicate with the opener window
                if (window.opener) {
                  try {
                    console.log(
                      "Sending model selection to opener window:",
                      model,
                    );
                    // Try to dispatch a custom event to the opener window
                    window.opener.dispatchEvent(
                      new CustomEvent("model-selected", {
                        detail: { modelId: model },
                      }),
                    );

                    // Also try to save to localStorage as a fallback
                    localStorage.setItem("selectedModelId", model);

                    // Use direct IPC communication to ensure the event is received
                    if (window.electronAPI) {
                      console.log(
                        "Using IPC to send model selection event:",
                        model,
                      );
                      window.electronAPI.toggleModelSelector();

                      try {
                        window.electronAPI
                          .modelSelected(model)
                          .then(() => {
                            console.log("Model selection IPC call successful");
                          })
                          .catch((err: Error) => {
                            console.error("Error in IPC model selection:", err);
                          });
                      } catch (ipcError) {
                        console.error(
                          "Failed to call IPC modelSelected:",
                          ipcError,
                        );
                      }
                    }
                  } catch (error) {
                    console.error(
                      "Error communicating with opener window:",
                      error,
                    );
                  }
                } else {
                  console.warn("No opener window found, using IPC directly");
                  // Try IPC even if opener is not available
                  if (window.electronAPI) {
                    try {
                      window.electronAPI.modelSelected(model);
                      window.electronAPI.toggleModelSelector();
                    } catch (err) {
                      console.error(
                        "Error using IPC for model selection:",
                        err,
                      );
                    }
                  }
                }
              }}
            >
              <span>{formatModelName(model)}</span>
              {model === selectedModel && <Check size={12} />}
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
                  `Model selector button position: window(${winX},${winY}) + local(${rect.left},${rect.bottom}) = abs(${absX},${absY})`,
                );

                const width = 200;
                const height = 250;

                window.electronAPI.toggleModelSelector(
                  absX,
                  absY,
                  width,
                  height,
                );
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
        {formatModelName(selectedModel)}
        <ChevronDown
          size={12}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && supportedModels.length > 0 && (
        <div className="border-border bg-background absolute top-full left-0 z-10 mt-1 w-40 rounded-md border p-1 shadow-lg">
          {supportedModels.map((model) => (
            <button
              key={model}
              className={`hover:bg-primary/10 flex w-full items-center justify-between rounded px-2 py-1.5 text-xs ${
                model === selectedModel
                  ? "bg-primary/20 text-primary"
                  : "text-foreground"
              }`}
              onClick={() => {
                onSelectModel(model);
                setIsOpen(false);
              }}
            >
              <span>{formatModelName(model)}</span>
              {model === selectedModel && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
