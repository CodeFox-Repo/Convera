import { createAuthClient } from "better-auth/react";

// Determine base URL based on environment
const getBaseURL = () => {
  // // In development, use local server
  // if (process.env.NODE_ENV === "development" || !process.env.NODE_ENV) {
  //   return "http://localhost:3001";
  // }
  // In production, use production API
  return "http://localhost:3001";
};

// Create auth client with environment-aware configuration
export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});
