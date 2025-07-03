// Simple API client using fetch for admin check

// Base URL configuration - use local development server
// export const baseURL = "https://api.foxychat.net";
export const baseURL = "http://localhost:3001";

export interface AdminCheckResponse {
  isAdmin: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

// Simple admin check function
export const authAPI = {
  async isAdmin(): Promise<AdminCheckResponse> {
    try {
      // better-auth handles authentication via httpOnly cookies automatically
      // No need to manually add authorization headers
      const response = await fetch(`${baseURL}/api/user/is-admin`, {
        credentials: "include", // This is the key - includes cookies automatically
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.log("Admin check failed:", response.status, response.statusText);
        return { isAdmin: false };
      }

      const data = await response.json();
      return data as AdminCheckResponse;
    } catch (error) {
      console.error("Failed to check admin status:", error);
      return { isAdmin: false };
    }
  },
};
