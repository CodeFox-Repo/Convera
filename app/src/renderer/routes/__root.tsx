import { DragLayer } from "@/renderer/components/ui/drag-layer";
import BaseLayout from "@/renderer/layouts/base-layout";
import { useGlobalShortcuts } from "@/renderer/libs/utils/keyboard";
import { initGlobalShortcut } from "@/renderer/libs/utils/settings";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import React, { useEffect } from "react";

export const Route = createRootRoute({
  component: Root,
});

function Root() {
  // Register global keyboard shortcuts
  useGlobalShortcuts();

  // Initialize global shortcut from user settings when app loads
  useEffect(() => {
    const initShortcutAsync = async () => {
      try {
        await initGlobalShortcut();
      } catch (error) {
        console.error("Failed to initialize global shortcut:", error);
      }
    };
    initShortcutAsync();
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
