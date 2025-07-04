import { authAPI } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { useEffect } from "react";

export function useAuthRedirect() {
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && session) {
      // Only redirect if user is currently on auth pages
      const currentPath = window.location.pathname;
      const isOnAuthPage = currentPath.startsWith("/auth/");

      if (isOnAuthPage) {
        const checkRoleAndRedirect = async () => {
          try {
            const adminCheck = await authAPI.isAdmin();

            if (adminCheck.isAdmin) {
              // Redirect admin users to admin dashboard
              window.location.href = "/dashboard";
            } else {
              // Redirect normal users to user settings
              window.location.href = "/settings";
            }
          } catch (error) {
            console.error("Failed to check user role:", error);
            // Fallback to home page if role check fails
            window.location.href = "/";
          }
        };

        checkRoleAndRedirect();
      }
    }
  }, [session, isPending]);

  return { session, isPending };
}
