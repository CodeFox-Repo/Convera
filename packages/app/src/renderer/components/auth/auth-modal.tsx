import { AuthCard } from "@daveyplate/better-auth-ui";
import React from "react";

export function AuthModal() {
  const next = encodeURIComponent("/settings?from=auth&tab=general");
  const callbackURL = `https://api.foxychat.net/redirect/auth?next=${next}`;

  return (
    <div className="w-full [&>*]:!max-w-none [&>*]:!w-full">
      <AuthCard
        pathname="sign-in"
        callbackURL={callbackURL}
        socialLayout="vertical"
        className="border-0 shadow-2xl shadow-black/50 !w-full !max-w-none"
        classNames={{
          base: "bg-card backdrop-blur-sm border-0 shadow-2xl shadow-black/50 relative z-20 overflow-hidden auth-card !w-full !max-w-none",
          header: "pb-4 pt-6 px-8 text-center relative z-30",
          title: "text-2xl font-bold text-primary text-center relative z-30",
          description: "text-foreground/80 mt-1 text-center relative z-30",
          content: "px-6 pb-6 space-y-0 relative z-30",
          // Keep the separator fully within card width
          separator: "bg-border/60 !w-1/12 relative z-30 !important",
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
  );
}
