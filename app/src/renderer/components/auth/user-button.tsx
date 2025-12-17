import { authClient } from "@/renderer/libs/auth-client";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import { AnimatePresence } from "framer-motion";
import { ChevronUp, Key, LogOut, User } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { AuthSetupModal } from "./auth-setup-modal";

interface CustomUserButtonProps {
  collapsed?: boolean;
}

export function UserButton({ collapsed = false }: CustomUserButtonProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const { data: session, isPending } = authClient.useSession();
  const { signOut } = authClient;
  const { settings } = useSettingsStore();

  // Determine if custom API is configured
  const hasValidCustomApi =
    settings?.openai?.apiKey &&
    settings.openai.apiKey.trim() !== "" &&
    settings?.openai?.endpoint &&
    settings.openai.endpoint.trim() !== "";

  const useRemoteStore = settings?.openai?.useRemoteStore !== false;
  const isUsingCustomApi = !session?.user && hasValidCustomApi && !useRemoteStore;

  // Get user initials for fallback
  const getUserInitials = (name?: string, email?: string) => {
    if (name) {
      return name
        .split(" ")
        .map((word) => word.charAt(0))
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (email) {
      return email.charAt(0).toUpperCase();
    }
    return "U";
  };

  const handleClick = () => {
    if (!session?.user) {
      setShowAuthModal(true);
    } else {
      setShowMenu(!showMenu);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setShowMenu(false);
    //TODO: remove reload the page or redirect
    window.location.reload();
  };

  // Auto-close modal when user successfully logs in
  useEffect(() => {
    if (session?.user && showAuthModal) {
      setShowAuthModal(false);
    }
  }, [session?.user, showAuthModal]);

  // Close modal when custom API is configured
  useEffect(() => {
    const handleCustomApiConfigured = () => {
      setShowAuthModal(false);
    };

    window.addEventListener("custom-api-configured", handleCustomApiConfigured);

    return () => {
      window.removeEventListener(
        "custom-api-configured",
        handleCustomApiConfigured,
      );
    };
  }, []);

  if (isPending) {
    return (
      <button
        disabled
        className={`${
          collapsed ? "p-2" : "w-full px-3 py-2.5"
        } rounded-lg text-muted-foreground bg-muted hover:bg-muted/80 transition-colors flex items-center ${
          collapsed ? "justify-center" : "gap-3 text-sm"
        }`}
      >
        <div className="w-4 h-4 animate-pulse bg-muted-foreground/20 rounded-full flex-shrink-0" />
        {!collapsed && <span>Loading...</span>}
      </button>
    );
  }

  const userInitials = session?.user
    ? getUserInitials(session.user.name, session.user.email)
    : "";

  return (
    <>
      {session?.user ? (
        // Logged in state with popover menu
        <Popover open={showMenu} onOpenChange={setShowMenu}>
          <PopoverTrigger asChild>
            <button
              className={`${
                collapsed ? "p-2" : "w-full px-3 py-2.5"
              } rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center ${
                collapsed ? "justify-center" : "gap-3 text-sm"
              }`}
            >
              <Avatar className="h-4 w-4 flex-shrink-0">
                {session.user.image && (
                  <AvatarImage
                    src={session.user.image}
                    alt={session.user.name || "User"}
                  />
                )}
                <AvatarFallback className="bg-gradient-to-br from-orange-400 to-pink-500 text-white text-[9px] font-medium">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <span className="truncate flex-1 text-left">
                    {session.user.name ||
                      session.user.email?.split("@")[0] ||
                      "User"}
                  </span>
                  <ChevronUp size={12} className="opacity-60 flex-shrink-0" />
                </>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-56 p-2 bg-popover border border-border/60 rounded-lg shadow-lg"
            align="start"
            side="top"
          >
            <div className="space-y-1">
              {/* User Info */}
              <div className="px-3 py-2 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {session.user.image && (
                      <AvatarImage
                        src={session.user.image}
                        alt={session.user.name || "User"}
                      />
                    )}
                    <AvatarFallback className="bg-gradient-to-br from-orange-400 to-pink-500 text-white font-medium">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {session.user.name || "User"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {session.user.email}
                    </p>
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="space-y-1 pt-1">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                >
                  <LogOut size={16} />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : isUsingCustomApi ? (
        // Custom API mode - not logged in but has custom API configured
        <button
          onClick={handleClick}
          className={`${
            collapsed ? "p-2" : "w-full px-3 py-2.5"
          } rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center ${
            collapsed ? "justify-center" : "gap-3 text-sm"
          }`}
        >
          <Key size={16} className="flex-shrink-0 text-orange-500" />
          {!collapsed && (
            <span className="truncate flex-1 text-left">Custom API</span>
          )}
        </button>
      ) : (
        // Not logged in state
        <button
          onClick={handleClick}
          className={`${
            collapsed ? "p-2" : "w-full px-3 py-2.5"
          } rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center ${
            collapsed ? "justify-center" : "gap-3 text-sm"
          }`}
        >
          <User size={16} className="flex-shrink-0" />
          {!collapsed && <span>Account</span>}
        </button>
      )}

      <AnimatePresence>
        {showAuthModal && (
          <AuthSetupModal
            open={showAuthModal}
            onClose={() => setShowAuthModal(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
