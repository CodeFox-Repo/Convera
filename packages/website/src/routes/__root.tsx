import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { useLenis } from "@/hooks/use-lenis";
import { Providers } from "@/providers";
import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";

function RootComponent() {
  useLenis();
  const location = useLocation();
  // Pages that should not have navbar/footer
  // TODO: optimize this
  const isAuthPage = location.pathname.startsWith("/auth");
  const isUserPage = location.pathname.startsWith("/_user");

  return (
    <Providers>
      <Toaster />
      <Sonner />
      {!isAuthPage && !isUserPage && <Navbar />}
      <Outlet />
      {!isAuthPage && !isUserPage && <Footer />}
    </Providers>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
