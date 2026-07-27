import { defineConfig } from "vite";
import path from "path";
// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      // Resolved at runtime rather than bundled. The Agent SDK is ESM and ships a
      // per-platform native executable beside it, and @convera/hands loads a native
      // addon — neither survives being inlined into a CommonJS main-process bundle.
      external: [
        "@anthropic-ai/claude-agent-sdk",
        "@convera/agent-core",
        "@convera/hands",
        "@hurdlegroup/robotjs",
      ],
    },
  },
});
