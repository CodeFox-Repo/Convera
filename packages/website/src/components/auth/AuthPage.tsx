import { AuthCard } from "@daveyplate/better-auth-ui";
import { useParams, useSearch } from "@tanstack/react-router";
import LogoBrand from "../LogoBrand";
import SimpleBackground from "../SimpleBackground";

export default function AuthPage() {
  const { pathname = "sign-in" } = useParams({ from: "/auth/$pathname" });
  const search = useSearch({ from: "/auth/$pathname" });

  // Get redirect path from URL search params, default to home page
  const redirectPath = search.redirect || "/";

  /**
   * Authentication Redirect Strategy:
   *
   * 1. callbackURL (for OAuth providers like GitHub/Google):
   *    - Must be an absolute URL with protocol and domain
   *    - Used for cross-origin OAuth flow where the provider needs to redirect back
   *    - Example flow: User -> GitHub -> API callback -> Frontend URL
   *    - Production: https://foxychat.net/dashboard
   *    - Development: http://localhost:[port]/dashboard
   *
   * 2. redirectTo (for email/password sign-in):
   *    - Uses relative paths for frontend-only navigation
   *    - After successful API call, frontend handles the redirect internally
   *    - Avoids URL construction issues and keeps navigation flexible
   *    - Example: "/", "/dashboard", "/settings"
   *
   * Why different approaches?
   * - OAuth requires full URLs because GitHub/Google servers need to know where to redirect
   * - Regular sign-in happens entirely within our app, so relative paths work better
   */

  // Get the current origin dynamically (includes protocol, hostname, and port)
  const getCurrentOrigin = () => {
    if (process.env.NODE_ENV === "production") {
      return "https://foxychat.net";
    }
    return window.location.origin;
  };

  const oauthCallbackURL = `${getCurrentOrigin()}${redirectPath}`;
  const regularRedirectURL = redirectPath;

  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <SimpleBackground />
      <div className="relative z-10 w-full max-w-md space-y-8">
        {/* Logo Brand */}
        <div className="flex justify-center">
          <LogoBrand
            showStatus={false}
            showVersion={false}
            showCursor={true}
            size="lg"
            linkable={true}
          />
        </div>
        <style>{`
          /* Fix provider button icon overflow */
          [data-slot="button"] svg {
            max-width: 20px !important;
            max-height: 20px !important;
            width: 20px !important;
            height: 20px !important;
            flex-shrink: 0 !important;
          }
          
          /* Ensure proper button sizing for social providers */
          .auth-card button[type="button"]:has(svg) {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 0.5rem !important;
            overflow: hidden !important;
            max-height: 48px !important;
          }
          
          /* Fix spacing in auth forms */
          .auth-card form {
            display: flex !important;
            flex-direction: column !important;
            gap: 0.52rem !important;
          }
          
          /* Ensure consistent input field spacing */
          .auth-card input {
            width: 100% !important;
            box-sizing: border-box !important;
          }
          
          /* Fix checkbox alignment in sign-up */
          .auth-card input[type="checkbox"] {
            width: auto !important;
            margin-right: 0.5rem !important;
          }
          
          /* Fix label and checkbox container in sign-up */
          .auth-card label:has(input[type="checkbox"]) {
            display: flex !important;
            align-items: center !important;
            margin: 0.25rem 0 !important;
          }
          
          /* Ensure proper spacing between form elements */
          .auth-card .space-y-4 > * {
            margin-bottom: 0.75rem !important;
          }
          
          /* Reduce spacing between input fields and labels */
          .auth-card label:not(:has(input[type="checkbox"])) {
            margin-bottom: 0.25rem !important;
          }
          
          /* Reduce spacing for form field groups */
          .auth-card .space-y-1 > * + * {
            margin-top: 0.5rem !important;
          }
          
          /* Fix password strength indicator if present */
          .auth-card [role="progressbar"] {
            width: 100% !important;
            margin-top: 0.5rem !important;
          }
          
          /* Ensure terms and conditions text is readable */
          .auth-card label span {
            font-size: 0.875rem !important;
            line-height: 1.25rem !important;
          }

          /* Override auth card button colors to use orange theme */
          .auth-card button[type="submit"] {
            background: var(--orange-primary) !important;
            border-color: var(--orange-primary) !important;
            color: rgb(0 0 0) !important;
          }

          .auth-card button[type="submit"]:hover {
            background: var(--orange-secondary) !important;
            border-color: var(--orange-secondary) !important;
          }

          /* Social provider buttons */
          .auth-card button[type="button"] {
            background: var(--bg-card) !important;
            border-color: var(--border) !important;
            color: var(--text-primary) !important;
          }

          .auth-card button[type="button"]:hover {
            background: var(--bg-orange-subtle) !important;
            border-color: var(--orange-primary) !important;
          }

          /* Input focus styles */
          .auth-card input:focus {
            border-color: var(--orange-primary) !important;
            box-shadow: 0 0 0 2px rgba(251, 146, 60, 0.1) !important;
          }

          /* Placeholder text */
          .auth-card input::placeholder {
            color: var(--text-muted) !important;
          }

          /* Inner border glow effect for the entire viewport */
          main::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            z-index: 1000;
            box-shadow: 
              inset 0 0 80px rgba(251, 146, 60, 0.3),
              inset 0 0 120px rgba(251, 146, 60, 0.1),
              inset 0 0 200px rgba(251, 146, 60, 0.05);
            border-radius: 0;
          }

   
        `}</style>

        {/* Auth Card */}
        <div>
          <AuthCard
            pathname={pathname}
            callbackURL={oauthCallbackURL}
            redirectTo={regularRedirectURL}
            socialLayout="vertical"
            className="relative z-20 border-0 shadow-2xl shadow-black/50"
            classNames={{
              base: "bg-card backdrop-blur-sm border border-orange shadow-2xl shadow-black/50 relative z-20 overflow-hidden auth-card",
              header: "pb-4 pt-6 px-8 relative z-30",
              title: "text-2xl font-bold text-primary  relative z-30",
              description: "text-secondary  mt-1 relative z-30",
              content: "px-8 pb-6 space-y-0 relative z-30",
              separator: "bg-border relative z-30",
              form: {
                base: "space-y-1 relative z-30",
                label: "text-sm font-medium text-primary relative z-30",
                input:
                  "w-full px-4 py-2.5 rounded-lg border border-border focus:border-orange focus:ring-2 focus:ring-orange-subtle transition-all duration-200 bg-input text-primary relative z-30",
                error:
                  "text-red-600 text-sm bg-red-950/20 border border-red-500/50 rounded-lg p-3 relative z-30",
              },
              footer: "px-8 pb-4 pt-3 border-t border-border relative z-30",
              footerLink:
                "text-orange-primary hover:text-orange-light font-medium transition-colors duration-200 relative z-30",
            }}
          />
        </div>
      </div>
    </main>
  );
}
