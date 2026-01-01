import { useQuery } from "@tanstack/react-query";
import { authAPI, AdminCheckResponse } from "./api-client";
import { useSession } from "./auth-client";

/**
 * Hook for checking admin status with automatic caching and deduplication
 * Uses React Query to prevent multiple simultaneous API calls
 */
export const useAdminStatus = () => {
  const { data: session, isPending: sessionLoading } = useSession();
  
  const userId = session?.user?.id;
  const userEmail = session?.user?.email;

  // Use React Query for caching and deduplication
  const {
    data: adminData,
    isLoading: isCheckingAdmin,
    error,
    isError
  } = useQuery<AdminCheckResponse>({
    queryKey: ['admin-status', userId],
    queryFn: async () => {
      console.log(`🔍 Checking admin status for user: ${userEmail} (${userId})`);
      const result = await authAPI.isAdmin();
      console.log(`✅ Admin check complete for ${userEmail}: ${result.isAdmin ? 'ADMIN' : 'USER'}`);
      return result;
    },
    enabled: !!userId && !!userEmail && !sessionLoading, // Only run when user is authenticated
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes (renamed from cacheTime in v5)
    retry: 2,
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch on component mount if data exists
  });

  return {
    isAdmin: adminData?.isAdmin ?? false,
    isLoading: sessionLoading || isCheckingAdmin,
    error: isError ? error : null,
    hasChecked: !!adminData && !isCheckingAdmin,
  };
};