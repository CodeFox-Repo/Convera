import { useEffect } from "react";
import { RendererAgentHostService } from "@/renderer/libs/agent-host-service";

export function AgentHostRuntime() {
  useEffect(() => {
    const service = new RendererAgentHostService();
    service.start();
    return () => service.dispose();
  }, []);
  return null;
}
