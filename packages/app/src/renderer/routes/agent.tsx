import { createFileRoute } from "@tanstack/react-router";
import { AgentChatPage } from "../components/agent-chat";

export const Route = createFileRoute("/agent")({
  component: AgentChatPage,
});
