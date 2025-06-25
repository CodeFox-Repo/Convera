import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { z } from "zod";
import Chat from "../components/chat";

const chatSearchSchema = z.object({
  fromX: z.string().optional(),
  fromY: z.string().optional(),
});

export const Route = createFileRoute("/chat")({
  component: ChatPage,
  validateSearch: chatSearchSchema,
});

function ChatPage() {
  return <Chat />;
}
