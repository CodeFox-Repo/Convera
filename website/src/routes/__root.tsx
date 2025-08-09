import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { useLenis } from "@/hooks/use-lenis";
import { Providers } from "@/providers";
import { createRootRoute, Outlet } from "@tanstack/react-router";

function RootComponent() {
  useLenis();

  return (
    <Providers>
      <Toaster />
      <Sonner />
      <Outlet />
    </Providers>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
