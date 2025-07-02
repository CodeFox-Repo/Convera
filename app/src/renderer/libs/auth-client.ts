import { createAuthClient } from "better-auth/react";
import { getBaseUrl } from "./env";

// Create auth client with environment-aware configuration
export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
});

// Check if user is currently logged in
export async function isLoggedIn(): Promise<boolean> {
  try {
    const session = await authClient.getSession();
    return session?.data?.session?.id ? true : false;
  } catch (error) {
    console.error("Error checking auth status:", error);
    return false;
  }
}

// Get current user session
export async function getCurrentSession() {
  try {
    const session = await authClient.getSession();
    return session?.data || null;
  } catch (error) {
    console.error("Error getting session:", error);
    return null;
  }
}
