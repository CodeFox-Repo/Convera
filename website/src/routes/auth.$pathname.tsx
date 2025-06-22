import AuthPage from "@/components/AuthPage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/$pathname")({
  component: AuthPage,
});
