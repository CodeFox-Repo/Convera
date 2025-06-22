import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    process.env.NODE_ENV === "production-dev"
      ? "https://api.foxychat.net"
      : "http://localhost:3001",
});

export const { useSession, signIn, signUp, signOut } = authClient;
