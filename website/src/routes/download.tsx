import Download from "@/components/Download";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/download")({
  component: Download,
});
