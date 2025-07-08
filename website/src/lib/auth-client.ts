import { createAuthClient } from "better-auth/react";

// Determine the correct base URL based on environment
export const getBaseURL = () => {
  // If explicitly set to production-dev, use production API
  if (process.env.NODE_ENV === "production-dev") {
    return "https://api.foxychat.net";
  }

  // If in production (Vercel), use production API
  if (process.env.NODE_ENV === "production") {
    return "https://api.foxychat.net";
  }

  // For development, use local server
  return "http://localhost:3001";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});

export const { useSession, signIn, signUp, signOut } = authClient;
