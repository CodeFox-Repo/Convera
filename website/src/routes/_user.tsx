import Navbar from "@/components/Navbar";
import { useSession } from "@/lib/auth-client";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_user")({
  beforeLoad: async () => {
    // This will be handled by the component since we need to check session client-side
    return {};
  },
  component: UserLayout,
});

function UserLayout() {
  const { data: session, isPending } = useSession();

  // Show loading while checking session
  if (isPending) {
    return (
      <>
        <Navbar />
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-orange-500"></div>
        </div>
      </>
    );
  }

  // Redirect to login if not authenticated
  if (!session) {
    const currentPath = window.location.pathname;
    const redirectParam = currentPath !== "/" ? `?redirect=${encodeURIComponent(currentPath)}` : "";
    window.location.href = `/auth/sign-in${redirectParam}`;
    return null;
  }

  return (
    <div className="relative min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Grid background pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(to right, rgb(161 161 170) 1px, transparent 1px),
                           linear-gradient(to bottom, rgb(161 161 170) 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }}
      />
      
      <Navbar />
      
      <div className="container relative mx-auto max-w-4xl py-8 pt-24">
        {/* Main content card with clear boundaries */}
        <div className="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl">
          {/* Continuous border effect from top-left down */}
          <div className="absolute left-0 top-0 h-full w-[1px] bg-zinc-300 dark:bg-zinc-700" />
          <div className="absolute left-0 top-0 h-[1px] w-full bg-zinc-300 dark:bg-zinc-700" />
          
          {/* Bottom border */}
          <div className="absolute bottom-0 left-0 h-[1px] w-full bg-zinc-300 dark:bg-zinc-700" />
          <div className="absolute right-0 top-0 h-full w-[1px] bg-zinc-300 dark:bg-zinc-700" />
          
          {/* Content */}
          <div className="relative p-8">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
