import { DevResetDock } from "@/renderer/components/dev/dev-reset-dock";
import { DragLayer } from "@/renderer/components/ui/drag-layer";
import BaseLayout from "@/renderer/layouts/base-layout";
import { initGlobalShortcut } from "@/renderer/libs/utils/settings";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import React, { useEffect } from "react";

export const Route = createRootRoute({
  component: Root,
});

/**
 * `import.meta` is illegal under this tsconfig's CommonJS module target, so the
 * gate is written as the expression Vite's define already rewrites to a literal
 * (`false` in a production build) — which is what lets rollup drop the dock and
 * its whole import subtree.
 */
const IS_DEV = process.env.NODE_ENV !== "production";

function Root() {
  // Initialize global shortcut from user settings when app loads
  useEffect(() => {
    initGlobalShortcut().catch((error) => {
      console.error("Failed to initialize global shortcut:", error);
    });
  }, []);

  return (
    <div className="app-container relative h-screen w-full overflow-hidden bg-transparent">
      <DragLayer height={6} />
      <BaseLayout>
        <Outlet />
      </BaseLayout>
      {IS_DEV && <DevResetDock />}
    </div>
  );
}
