import React, { useEffect } from "react";
import BaseLayout from "@/layouts/BaseLayout";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useGlobalShortcuts } from "@/utils/keyboard";
import { initGlobalShortcut } from "@/utils/settings";

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
