import { AuthQueryProvider } from "@daveyplate/better-auth-tanstack";
import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { ReactNode } from "react";
import { authClient } from "./lib/auth-client";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
    },
  },
});

// Separate component that uses router
function AuthProviderWithRouter({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <AuthUIProvider
      authClient={authClient}
      navigate={(href: string) => router.navigate({ to: href })}
      replace={(href: string) => router.navigate({ to: href, replace: true })}
      Link={({ href, children, ...props }) => (
        <Link to={href} {...props}>
          {children}
        </Link>
      )}
      providers={["github"]}
    >
      {children}
    </AuthUIProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthQueryProvider>
        <AuthProviderWithRouter>{children}</AuthProviderWithRouter>
      </AuthQueryProvider>
    </QueryClientProvider>
  );
}
