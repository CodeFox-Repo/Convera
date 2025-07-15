import Navbar from "@/components/Navbar";
import { useSession } from "@/lib/auth-client";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_user")({
  beforeLoad: async ({ location }) => {
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
    window.location.href = "/auth/sign-in";
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto max-w-4xl py-8 pt-24">
        <Outlet />
      </div>
    </div>
  );
}
