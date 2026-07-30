import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { ChatProvider } from "../libs/stores/chat-store";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
    },
  },
});

/**
 * Base layout component that provides the main application structure
 */
export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <main className="text-foreground h-full w-full bg-transparent">
        <ChatProvider>{children}</ChatProvider>
      </main>
    </QueryClientProvider>
  );
}
