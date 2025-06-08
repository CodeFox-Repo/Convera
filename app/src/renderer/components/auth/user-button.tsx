import { authClient } from "@/renderer/libs/auth-client";
import { User } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Dialog, DialogContent } from "../ui/dialog";
import { AuthModal } from "./auth-modal";

interface CustomUserButtonProps {
  collapsed?: boolean;
}

export function UserButton({ collapsed = false }: CustomUserButtonProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { data: session, isPending } = authClient.useSession();

  const handleClick = () => {
    if (!session?.user) {
      setShowAuthModal(true);
    } else {
      // User is logged in - could add menu here later
      console.log("User is logged in:", session.user);
    }
  };

  // Auto-close modal when user successfully logs in
  useEffect(() => {
    if (session?.user && showAuthModal) {
      setShowAuthModal(false);
    }
  }, [session?.user, showAuthModal]);

  if (isPending) {
    return (
      <button
        disabled
        className={`${
          collapsed ? "p-2" : "w-full p-2"
        } rounded-lg text-muted-foreground bg-muted hover:bg-muted/80 transition-colors flex items-center ${
          collapsed ? "justify-center" : "gap-3"
        }`}
      >
        <div className="w-4 h-4 animate-pulse bg-muted-foreground/20 rounded-full" />
        {!collapsed && <span className="text-sm">Loading...</span>}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={`${
          collapsed ? "p-2" : "w-full p-2"
        } rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center ${
          collapsed ? "justify-center" : "gap-3"
        }`}
      >
        {session?.user ? (
          // Logged in state
          <>
            <div className="w-4 h-4 bg-green-500 rounded-full flex-shrink-0" />
            {!collapsed && (
              <span className="text-sm truncate">
                {session.user.name || session.user.email || "User"}
              </span>
            )}
          </>
        ) : (
          // Not logged in state
          <>
            <User size={16} className="flex-shrink-0" />
            {!collapsed && <span className="text-sm">Account</span>}
          </>
        )}
      </button>

      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent className="sm:max-w-md bg-card ">
          <AuthModal onClose={() => setShowAuthModal(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
