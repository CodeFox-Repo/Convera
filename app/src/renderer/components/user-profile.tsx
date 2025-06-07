import React from "react";
import { authClient } from "../libs/auth-client";

interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

interface UserProfileProps {
  user: User;
  onSignOut?: () => void;
}

export function UserProfile({ user, onSignOut }: UserProfileProps) {
  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      onSignOut?.();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-card text-card-foreground rounded-lg border shadow-sm p-6">
      <div className="text-center">
        <div className="mb-4">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name}
              className="w-16 h-16 rounded-full mx-auto"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mx-auto">
              <span className="text-primary-foreground text-xl font-semibold">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <h2 className="text-xl font-semibold text-foreground">{user.name}</h2>
        <p className="text-muted-foreground mb-6">{user.email}</p>

        <button
          onClick={handleSignOut}
          className="w-full py-2 px-4 border border-border rounded-md shadow-sm text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
