import { DragLayer } from "@/renderer/components/ui/drag-layer";
import BaseLayout from "@/renderer/layouts/base-layout";
import { initGlobalShortcut } from "@/renderer/libs/utils/settings";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import React, { useEffect } from "react";

export const Route = createRootRoute({
  component: Root,
});

function Root() {
  // Initialize global shortcut from user settings when app loads
  useEffect(() => {
    initGlobalShortcut().catch((error) => {
      console.error("Failed to initialize global shortcut:", error);
    });
  }, []);

  return (
    <div className="app-container relative h-screen w-full overflow-hidden">
      <DragLayer height={6} />
      <BaseLayout>
        <Outlet />
      </BaseLayout>
    </div>
  );
}
