import BaseLayout from "@/renderer/layouts/base-layout";
import { useGlobalShortcuts } from "@/renderer/libs/utils/keyboard";
import { initGlobalShortcut } from "@/renderer/libs/utils/settings";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import React, { useEffect } from "react";

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
