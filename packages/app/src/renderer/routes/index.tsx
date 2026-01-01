import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HomePage } from "../components/home";

const homeSearchSchema = z.object({
  lastX: z.string().optional(),
  lastY: z.string().optional(),
});

export const Route = createFileRoute("/")({
  component: HomePage,
  validateSearch: homeSearchSchema,
});
