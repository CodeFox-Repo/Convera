import React from "react";
import { ChatProvider } from "../libs/stores/chat-store";

/**
 * Base layout component that provides the main application structure
 */
export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="bg-background/95 text-foreground h-full w-full">
      <ChatProvider>
        {children}
        </ChatProvider>
      </main>
    </>
  );
}
