import { AuthCallback } from "@daveyplate/better-auth-ui";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { getBaseURL } from "../lib/auth-client";
import React from "react";

export const Route = createFileRoute("/redirect/auth")({
  component: RedirectAuthPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      next: (typeof search.next === "string" && search.next) || "/settings?from=auth&tab=general",
      token: typeof search.token === "string" ? search.token : undefined,
    };
  },
});

function RedirectAuthPage() {
  const { next } = useSearch({ from: "/redirect/auth" }) as {
    next: string;
  };

  const run = async () => {
    try {
      await new Promise((r) => setTimeout(r, 100));
      const res = await fetch(`${getBaseURL()}/api/auth/exchange/init`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data?.token) {
        console.log("data", data);
        const deeplink = `foxychat://auth/callback?token=${encodeURIComponent(
          data.token,
        )}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
        window.location.href = deeplink;

        return;
      }
    } catch {}
  };

  React.useEffect(() => {
    run();
  }, [next]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {/* Finalize better-auth session, then our useEffect triggers the deep link */}
      <div className="w-full max-w-md space-y-4 text-center">
        <AuthCallback />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Opening FoxyChat…</h1>
          <p className="text-sm opacity-80">
            If the app doesn’t open automatically, click the button below.
          </p>
          <div className="flex justify-center gap-2">
            <a onClick={() => run()} className="rounded bg-orange-500 px-4 py-2 text-black">
              Open FoxyChat
            </a>
            <a href="/download" className="rounded border px-4 py-2">
              Download
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
