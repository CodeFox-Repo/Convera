import React, { useEffect, useState } from "react";
import { LoginForm } from "../components/login-form";
import { UserProfile } from "../components/user-profile";
import { authClient } from "../libs/auth-client";

interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);

  // Check authentication status on component mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    const session = await authClient.getSession();
    if (session.data?.user) {
      setUser(session.data.user);
    }
    setLoading(false);
  };

  const handleLoginSuccess = () => {
    setShowAuth(false);
    checkAuthStatus(); // Refresh session after login
  };

  const handleSignOut = () => {
    setUser(null);
    setShowAuth(false);
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 dark:from-background dark:to-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 dark:from-background dark:to-background">
      <div className="text-center space-y-6 w-full max-w-lg px-4">
        <h1 className="text-4xl font-bold text-foreground">FoxyChat</h1>

        {!user ? (
          // Not authenticated
          <div className="space-y-4">
            <p className="text-lg text-muted-foreground">
              Welcome to FoxyChat! Please sign in to continue.
            </p>

            {!showAuth ? (
              <div className="space-y-2">
                <button
                  onClick={() => setShowAuth(true)}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Sign In
                </button>
                <div className="text-sm text-muted-foreground">
                  Click to access your account
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <LoginForm onSuccess={handleLoginSuccess} />
                <button
                  onClick={() => setShowAuth(false)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Back to welcome
                </button>
              </div>
            )}
          </div>
        ) : (
          // Authenticated
          <div className="space-y-4">
            <p className="text-lg text-muted-foreground">
              Welcome back! You are successfully signed in.
            </p>
            <div className="text-sm text-muted-foreground mb-4">
              This is the primary interface for FoxyChat
            </div>
            <UserProfile user={user} onSignOut={handleSignOut} />
          </div>
        )}
      </div>
    </div>
  );
}
