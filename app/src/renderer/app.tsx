import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import "../shared/localization/i18n";
import AgentPopover from "./components/chat/popover/agent-popover";
import ModelSelector from "./components/chat/popover/model-selector-popover";
import "./global.css";
import { updateAppLanguage } from "./libs/helper/language_helpers";
import { useThemeSync } from "./libs/hooks/use-theme-sync";
import { routeTree } from "./routes/routeTree.gen";

// Router type declarations
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

declare global {
  interface Window {
    router?: typeof router;
  }
}

// Create router instance with debug options
const history = createMemoryHistory({
  initialEntries: ["/"],
});

const router = createRouter({ 
  routeTree, 
  history,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

if (typeof window !== "undefined") {
  window.router = router;
}

export default function App() {
  const { i18n } = useTranslation();
  const [view, setView] = useState<string | null>(null);

  // Use proper theme synchronization hook instead of manual sync
  useThemeSync();

  useEffect(() => {
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
        <ModelSelector />
      </div>
    );
  }

  // Normal app view
  return <RouterProvider router={router} />;
}

const root = createRoot(document.getElementById("app")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
