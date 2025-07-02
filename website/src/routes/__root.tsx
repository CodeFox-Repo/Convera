import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/providers";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

export const Route = createRootRoute({
  component: () => (
    <Providers>
      <Toaster />
      <Sonner />
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </Providers>
  ),
});
