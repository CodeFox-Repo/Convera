import { AuthCard } from "@daveyplate/better-auth-ui";
import { useParams } from "@tanstack/react-router";

export default function AuthPage() {
  const { pathname = "sign-in" } = useParams({ from: "/auth/$pathname" });

  return (
    <main className="container flex min-h-screen grow flex-col items-center justify-center gap-3 self-center p-4 md:p-6">
      <AuthCard pathname={pathname} />
      <p
        className={`text-muted-foreground text-xs ${
          ["callback", "settings", "sign-out"].includes(pathname) ? "hidden" : ""
        }`}
      >
        Powered by{" "}
        <a
          className="text-blue-600 underline"
          href="https://better-auth.com"
          target="_blank"
          rel="noreferrer"
        >
          better-auth
        </a>
      </p>
    </main>
  );
}
