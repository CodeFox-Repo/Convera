import { AuthCard } from "@daveyplate/better-auth-ui";
import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import React from "react";

export const Route = createFileRoute("/auth/$pathname")({
  component: RouteComponent,
});

function RouteComponent() {
  const { pathname } = useParams({ from: "/auth/$pathname" });
  // keep for future extension if we need to accept ?redirect from web
  useSearch({ from: "/auth/$pathname" });

  // Use website redirect page to complete OAuth and then deep link back to app
  const next = encodeURIComponent("/settings?from=auth&tab=general");
  const oauthCallbackURL = `https://www.foxychat.net/redirect/auth?next=${next}`;

  return (
    <main className="container flex grow flex-col items-center justify-center gap-3 self-center p-4 md:p-6">
      <AuthCard pathname={pathname} callbackURL={oauthCallbackURL} />
    </main>
  );
}
