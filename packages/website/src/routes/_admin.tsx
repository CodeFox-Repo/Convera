import { authAPI } from "@/lib/api-client";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin")({
  beforeLoad: async ({ location }) => {
    // Check if user is admin using simple API
    try {
      const adminCheck = await authAPI.isAdmin();
      if (!adminCheck.isAdmin) {
        throw redirect({
          to: "/auth/$pathname",
          params: {
            pathname: "sign-in",
          },
          search: {
            redirect: location.pathname,
          },
        });
      }
      return {
        user: adminCheck.user,
      };
    } catch (error) {
      console.error("Admin check failed:", error);
      throw redirect({
        to: "/auth/$pathname",
        params: {
          pathname: "sign-in",
        },
        search: {
          redirect: location.pathname,
        },
      });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="bg-background min-h-screen">
      <Outlet />
    </div>
  );
}
