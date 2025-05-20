import { RouterProvider } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import "../shared/localization/i18n";
import AgentPopover from "./components/chat/agent-popover";
import ModelSelector from "./components/chat/model-selector";
import { DragLayer } from "./components/ui/drag-layer";
import "./global.css";
import { updateAppLanguage } from "./libs/helper/language_helpers";
import { syncThemeWithLocal } from "./libs/helper/theme_helpers";
import { getSettings } from "./libs/utils/settings";
import { router } from "./routes/router";

export default function App() {
  const { i18n } = useTranslation();
  const [view, setView] = useState<string | null>(null);

  useEffect(() => {
    syncThemeWithLocal();
    updateAppLanguage(i18n);

    // Check for hash in URL
    const hash = window.location.hash.replace("#", "");
    if (hash) {
      setView(hash);
    }

    // Check for view in query params
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get("view");
    if (viewParam) {
      setView(viewParam);
    }
  }, [i18n]);

  // Render special views based on hash or query params
  if (view === "agent-popover") {
    return (
      <div className="agent-popover-container h-screen w-full overflow-hidden">
        <AgentPopover />
      </div>
    );
  }

  // Render model selector popover view
  if (view === "model-selector") {
    return (
      <div className="model-selector-container h-screen w-full overflow-hidden">
        <ModelSelector
          selectedModel={getSettings().openai.modelId}
          onSelectModel={(modelId) => {
            // Send the selected model back to the main window via IPC
            if (window.electronAPI) {
              window.electronAPI.toggleModelSelector();
              // Dispatch a custom event that will be caught by the main window
              window.opener?.dispatchEvent(
                new CustomEvent("model-selected", {
                  detail: { modelId },
                }),
              );
            }
          }}
        />
      </div>
    );
  }

  // Normal app view
  return (
    <div className="app-container relative h-screen w-full overflow-hidden">
      <DragLayer height={6} />
      <RouterProvider router={router} />
    </div>
  );
}

const root = createRoot(document.getElementById("app")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
