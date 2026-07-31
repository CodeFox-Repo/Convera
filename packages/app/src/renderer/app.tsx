import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import "../shared/localization/i18n";
import "./global.css";
import { updateAppLanguage } from "./libs/helper/language_helpers";
import { ensureStarterTeam } from "./libs/agent-templates";
import { installAgentSpeech } from "./libs/agent-speech";
import { useFonts } from "./libs/hooks/use-fonts";
import { useThemeSync } from "./libs/hooks/use-theme-sync";
import { routeTree } from "./routes/routeTree.gen";
import { WorkspaceUIProvider } from "./libs/stores/workspace-ui-context";

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
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
});

if (typeof window !== "undefined") {
  window.router = router;
}

export default function App() {
  const { i18n } = useTranslation();

  // Use proper theme synchronization hook instead of manual sync
  useThemeSync();

  // Auto-load and configure fonts
  useFonts();

  useEffect(() => {
    updateAppLanguage(i18n);
  }, [i18n]);

  // First launch: hire a small starter team so the workspace isn't empty.
  useEffect(() => {
    void ensureStarterTeam();
    // Registered before any turn can run: an agent whose send_message reports
    // itself unavailable looks like a broken tool rather than a missing host.
    installAgentSpeech();
  }, []);

  // Single window - just render the router
  return (
    <WorkspaceUIProvider>
      <RouterProvider router={router} />
    </WorkspaceUIProvider>
  );
}

const root = createRoot(document.getElementById("app")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
