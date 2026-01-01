import NotFound from "@/components/NotFound";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$")({
  component: NotFound,
});
