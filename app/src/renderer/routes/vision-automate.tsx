import { createFileRoute } from "@tanstack/react-router";
import VisionChatView from "../components/chat/core/vision-chat-view";

export const Route = createFileRoute("/vision-automate")({
  component: VisionChatView,
});
