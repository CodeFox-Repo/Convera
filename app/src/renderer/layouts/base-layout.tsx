import { useThemeSync } from "@/renderer/libs/hooks/use-theme-sync";
import React from "react";

/**
 * Base layout component that provides the main application structure
 */
export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Listen for theme changes from settings
  useThemeSync();

  return (
    <>
      <main className="bg-background/95 text-foreground h-screen w-screen">
        {children}
      </main>
    </>
  );
}
