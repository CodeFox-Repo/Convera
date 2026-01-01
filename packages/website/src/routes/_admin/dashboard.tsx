import AdminDashboard from "@/components/dashboard/AdminDashboard";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin/dashboard")({
  component: AdminDashboard,
});
