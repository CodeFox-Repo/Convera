// Safely detect development mode for both main and renderer processes
export const inDevelopment = (() => {
  // Check if we're in a development environment using available indicators
  if (typeof process !== "undefined") {
    // Check environment variables
    if (process.env.NODE_ENV === "production-development") {
      return true;
    }
    // Check if VITE dev server is running
    if (process.env.VITE_DEV_SERVER_URL !== undefined) {
      return true;
    }
  }

  // For renderer process, check if we're running on localhost
  if (typeof window !== "undefined" && typeof location !== "undefined") {
    if (
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1"
    ) {
      return true;
    }
  }

  // Default to false (production mode)
  return false;
})();
