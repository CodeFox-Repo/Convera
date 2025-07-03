import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/providers";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import React from "react";

// Lazy load devtools only in development
const TanStackRouterDevtools =
  process.env.NODE_ENV === 'production'
    ? () => null
    : React.lazy(() =>
        import('@tanstack/react-router-devtools').then((res) => ({
          default: res.TanStackRouterDevtools,
        }))
      );

export const Route = createRootRoute({
  component: () => (
    <Providers>
      <Toaster />
      <Sonner />
      <Outlet />
      {process.env.NODE_ENV !== 'production' && (
        <React.Suspense fallback={null}>
          <TanStackRouterDevtools position="bottom-right" />
        </React.Suspense>
      )}
    </Providers>
  ),
});
