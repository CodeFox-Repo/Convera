import React, { useEffect } from "react";
import BaseLayout from "@/renderer/layouts/BaseLayout";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useGlobalShortcuts } from "@/renderer/utils/keyboard";
import { initGlobalShortcut } from "@/renderer/utils/settings";

export const RootRoute = createRootRoute({
  component: Root,
});

function Root() {
  // Register global keyboard shortcuts
  useGlobalShortcuts();

  // Initialize global shortcut from user settings when app loads
  useEffect(() => {
    initGlobalShortcut();
  }, []);

  return (
    <BaseLayout>
      <Outlet />
    </BaseLayout>
  );
}
