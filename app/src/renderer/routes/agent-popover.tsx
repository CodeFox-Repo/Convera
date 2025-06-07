import { createFileRoute } from "@tanstack/react-router";
import AgentPopover from "../components/chat/popover/agent-popover";

export const Route = createFileRoute("/agent-popover")({
  component: AgentPopover,
});
