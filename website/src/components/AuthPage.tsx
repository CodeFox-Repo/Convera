import { AuthCard } from "@daveyplate/better-auth-ui";
import { useParams, useSearch } from "@tanstack/react-router";

export default function AuthPage() {
  const { pathname = "sign-in" } = useParams({ from: "/auth/$pathname" });
  const search = useSearch({ from: "/auth/$pathname" });

  // Get redirect URL from search params, with environment-based fallback
  const redirectURL =
    search.redirect ||
    (process.env.NODE_ENV === "production" ? "https://foxychat.net" : "http://localhost:8080");

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-white to-orange-50/50 p-4">
      <div className="relative z-10 w-full max-w-md">
        <style>{`
          /* Fix provider button icon overflow */
          [data-slot="button"] svg {
            max-width: 20px !important;
            max-height: 20px !important;
            width: 20px !important;
            height: 20px !important;
            flex-shrink: 0 !important;
          }
          
          /* Ensure proper button sizing */
          button[type="button"] {
            position: relative !important;
            overflow: hidden !important;
            max-height: 48px !important;
          }
          
          /* Fix any absolute positioned elements */
          .auth-card * {
            position: relative !important;
          }
        `}</style>

        <AuthCard
          pathname={pathname}
          callbackURL={redirectURL}
          redirectTo={redirectURL}
          socialLayout="vertical"
          className="relative z-20 border-0 shadow-2xl shadow-orange-100/50"
          classNames={{
            base: "bg-white/95 backdrop-blur-sm border border-orange-100/50 shadow-2xl shadow-orange-100/50 relative z-20 overflow-hidden auth-card",
            header: "pb-6 pt-8 px-8 relative z-30",
            title: "text-2xl font-bold text-gray-900 text-center relative z-30",
            description: "text-gray-600 text-center mt-2 relative z-30",
            content: "px-8 pb-8 space-y-0 relative z-30",
            separator: "bg-gray-200 relative z-30",
            form: {
              base: "space-y-1 relative z-30",
              label: "text-sm font-medium text-gray-700 relative z-30",
              input:
                "w-full px-4  rounded-lg border border-gray-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all duration-200 bg-white relative z-30",
              error:
                "text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 relative z-30",
            },
            footer: "px-8 pb-6 pt-4 border-t border-gray-100 relative z-30",
            footerLink:
              "text-orange-600 hover:text-orange-700 font-medium transition-colors duration-200 relative z-30",
          }}
        />
      </div>
    </main>
  );
}
