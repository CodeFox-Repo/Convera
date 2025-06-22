import { createAuthClient } from "better-auth/react";
import { getBaseUrl } from "./env";

// Create auth client with environment-aware configuration
export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
});
