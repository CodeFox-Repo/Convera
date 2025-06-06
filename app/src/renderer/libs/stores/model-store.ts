// app/src/renderer/stores/model-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ModelState {
  selectedModelId: string;
  supportedModelIds: string[];
  setSelectedModelId: (modelId: string) => void;
  setSupportedModelIds: (modelIds: string[]) => void;
  subscribeToModelChanges: () => () => void;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => {
      const savedModel = localStorage.getItem("selectedModelId");
      const savedSupportedModels = localStorage.getItem("supportedModels");

      // Use fallback defaults since getSettings() is async and store creation can't be async
      const defaultModelIds: string[] = savedSupportedModels
        ? JSON.parse(savedSupportedModels)
        : [
            "gpt-4",
            "gpt-4-turbo",
            "gpt-3.5-turbo",
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307",
          ];

      return {
        selectedModelId: savedModel || "gpt-4",
        supportedModelIds: defaultModelIds,

        setSelectedModelId: (modelId) => {
          set({ selectedModelId: modelId });
          console.log("triggering model-selected event modelId:", modelId);
          localStorage.setItem("selectedModelId", modelId);

          window.electronAPI.hideModelSelector();
          window.electronAPI.modelSelected(modelId);

          window.dispatchEvent(
            new CustomEvent("model-selected", {
              detail: { modelId },
            }),
          );
        },

        setSupportedModelIds: (modelIds) => {
          const current = get().supportedModelIds;
          if (JSON.stringify(current) === JSON.stringify(modelIds)) {
            return;
          }

          set({ supportedModelIds: modelIds });
          localStorage.setItem("supportedModels", JSON.stringify(modelIds));
          window.dispatchEvent(new Event("supportedModels-updated"));
        },

        subscribeToModelChanges: () => {
          const customEventHandler = ((event: CustomEvent) => {
            const { modelId } = event.detail;
            set({ selectedModelId: modelId });
            localStorage.setItem("selectedModelId", modelId);
          }) as EventListener;

          const storageEventHandler = ((event: StorageEvent) => {
            if (event.key === "selectedModelId" && event.newValue) {
              set({ selectedModelId: event.newValue });
            }

            if (event.key === "supportedModels" && event.newValue) {
              try {
                const parsedModels = JSON.parse(event.newValue);
                set({ supportedModelIds: parsedModels });
              } catch (error) {
                console.error(
                  "Error parsing supportedModels from storage:",
                  error,
                );
              }
            }
          }) as EventListener;

          window.addEventListener("model-selected", customEventHandler);
          window.addEventListener("storage", storageEventHandler);

          return () => {
            window.removeEventListener("model-selected", customEventHandler);
            window.removeEventListener("storage", storageEventHandler);
          };
        },
      };
    },
    {
      name: "model-storage",
    },
  ),
);
