import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import Chat from "../components/chat";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

function ChatPage() {
  return (
      <Chat />
  );
} 