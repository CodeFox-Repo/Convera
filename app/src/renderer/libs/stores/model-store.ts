// app/src/renderer/stores/model-store.ts
import { getSettings } from "@/renderer/libs/utils/settings";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ModelState {
  selectedModelId: string;
  setSelectedModelId: (modelId: string) => void;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set) => {
      const settings = getSettings();
      const savedModel = localStorage.getItem("selectedModelId");

      return {
        selectedModelId: savedModel || settings.openai.modelId,

        setSelectedModelId: (modelId) => {
          set({ selectedModelId: modelId });
          localStorage.setItem("selectedModelId", modelId);
        },
      };
    },
    {
      name: "model-storage",
    },
  ),
);
