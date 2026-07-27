import tailwindcss from "@tailwindcss/vite";
import { tanstackRouterGenerator } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // Regenerates routeTree.gen.ts on build and dev. The `tsr generate` CLI that used to
    // do this is broken in the installed version ("routerGenerator.generator is not a
    // function"), so adding a route by hand silently produced a stale route tree.
    // Generation only — not the code-splitting variant, which would change bundling.
    tanstackRouterGenerator(),
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  publicDir: "public",
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
    },
    assetsDir: "assets",
    copyPublicDir: true,
  },
});
