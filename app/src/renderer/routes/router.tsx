import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { rootTree } from "./routes";

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

declare global {
  interface Window {
    router?: typeof router;
  }
}

const history = createMemoryHistory({
  initialEntries: ["/"],
});
export const router = createRouter({ routeTree: rootTree, history: history });

if (typeof window !== "undefined") {
  window.router = router;
}
