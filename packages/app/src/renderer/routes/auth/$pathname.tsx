import { Navigate, createFileRoute } from "@tanstack/react-router";
import React from "react";

export const Route = createFileRoute("/auth/$pathname")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Navigate to="/" replace />;
}
