import { AuthCard } from "@daveyplate/better-auth-ui";
import { useParams } from "@tanstack/react-router";
import Navbar from "./Navbar";

export default function AuthPage() {
  const { pathname = "sign-in" } = useParams({ from: "/auth/$pathname" });

  return (
    <div className="min-h-screen bg-linear-to-br from-orange-50 to-pink-50">
      <Navbar />
      <main className="container flex min-h-screen grow flex-col items-center justify-center gap-3 self-center p-4 pt-24 md:p-6">
        <div className="w-full max-w-md">
          <AuthCard pathname={pathname} />
        </div>
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
    </div>
  );
}
