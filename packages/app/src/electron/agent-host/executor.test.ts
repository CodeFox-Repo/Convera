import { describe, expect, it, vi } from "vitest";
import type { AgentHostJob } from "@/shared/types/agent-host";
import type { LocalAIRuntimeService } from "@/shared/types/local-ai";
import type { AgentHostRendererBridge } from "./renderer-bridge";
import { LocalAiAgentHostExecutor } from "./executor";

const job: AgentHostJob = {
  id: "job",
  channelId: "channel",
  conversationId: "trusted-conversation",
  triggerMessageId: "message",
  contextMessageIds: ["message"],
  mode: "direct",
  offeredAgentMemberIds: ["agent:trusted"],
  agentId: "trusted",
  agentMemberId: "agent:trusted",
  chain: { hops: 0, invoked: ["agent:trusted"] },
  status: "running",
  attempts: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("LocalAiAgentHostExecutor", () => {
  it("fences renderer-prepared identity to the durable job", async () => {
    const startChat = vi.fn(async () => undefined);
    const runtime = { startChat } as unknown as LocalAIRuntimeService;
    const bridge = {
      request: vi.fn(async () => ({
        request: {
          requestId: "request",
          turnId: "turn",
          conversationId: "forged-conversation",
          providerId: "codex-cli",
          concurrent: false,
          operation: { kind: "bootstrap", messages: [] },
          agent: { id: "forged", memberId: "agent:forged" },
        },
      })),
    } as unknown as AgentHostRendererBridge;
    const executor = new LocalAiAgentHostExecutor(runtime, bridge);

    await executor.execute(job, vi.fn());

    expect(startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "trusted-conversation",
        concurrent: true,
        agent: { id: "trusted", memberId: "agent:trusted" },
      }),
      expect.any(Function),
    );
  });
});
