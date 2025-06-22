import { AuthQueryProvider } from "@daveyplate/better-auth-tanstack";
import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
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

export function Providers({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthQueryProvider>
        <AuthUIProvider
          authClient={authClient}
          navigate={(href: string) => navigate({ to: href })}
          replace={(href: string) => navigate({ to: href, replace: true })}
          Link={({ href, children, ...props }) => (
            <Link to={href} {...props}>
              {children}
            </Link>
          )}
        >
          {children}
        </AuthUIProvider>
      </AuthQueryProvider>
    </QueryClientProvider>
  );
}
