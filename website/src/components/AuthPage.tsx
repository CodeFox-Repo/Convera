import { AuthCard } from "@daveyplate/better-auth-ui";
import { useParams, useSearch } from "@tanstack/react-router";

export default function AuthPage() {
  const { pathname = "sign-in" } = useParams({ from: "/auth/$pathname" });
  const search = useSearch({ from: "/auth/$pathname" });

  // Get redirect URL from search params, default to home page
  const redirectURL = search.redirect || "/";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-white to-orange-50/50 p-4">
      <div className="w-full max-w-md">
        <AuthCard
          pathname={pathname}
          callbackURL={redirectURL}
          redirectTo={redirectURL}
          className="border-0 shadow-2xl shadow-orange-100/50"
          classNames={{
            base: "bg-white/95 backdrop-blur-sm border border-orange-100/50 shadow-2xl shadow-orange-100/50",
            header: "pb-6 pt-8 px-8",
            title: "text-2xl font-bold text-gray-900 text-center",
            description: "text-gray-600 text-center mt-2",
            content: "px-8 pb-8 space-y-6",
            form: {
              base: "space-y-1",
              label: "text-sm font-medium text-gray-700",
              input:
                "w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all duration-200 bg-white",
              button:
                "w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-orange-200/50",
              forgotPasswordLink:
                "text-orange-600 hover:text-orange-700 text-sm font-medium transition-colors duration-200",
              error: "text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3",
            },
            footer: "px-8 pb-6 pt-4 border-t border-gray-100",
            footerLink:
              "text-orange-600 hover:text-orange-700 font-medium transition-colors duration-200",
          }}
        />
      </div>
    </main>
  );
}
