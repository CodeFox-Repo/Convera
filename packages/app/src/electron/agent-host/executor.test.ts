import { describe, expect, it, vi } from "vitest";
import type { AgentHostJob } from "@/shared/types/agent-host";
import type {
  LocalAIRuntimeService,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import type { AgentHostRendererBridge } from "./renderer-bridge";
import { LocalAiAgentHostExecutor } from "./executor";

const job: AgentHostJob = {
  id: "job",
  taskId: "job",
  channelId: "channel",
  channelKind: "channel",
  conversationId: "trusted-conversation",
  triggerMessageId: "message",
  contextMessageIds: ["message"],
  mode: "direct",
  offeredAgentMemberIds: ["agent:trusted"],
  agentId: "trusted",
  agentMemberId: "agent:trusted",
  chain: { hops: 0, invoked: ["agent:trusted"] },
  controlInstructions: [],
  status: "running",
  attempts: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("LocalAiAgentHostExecutor", () => {
  it("fences renderer-prepared identity to the durable job", async () => {
    const startChat = vi.fn(
      async (_request: unknown, emit: (event: LocalAIStreamEvent) => void) => {
        emit({
          type: "interaction",
          requestId: "request",
          interactionId: "interaction",
          kind: "input",
          name: "workspace:query",
          prompt: "Send a message",
          input: {
            kind: "send_message",
            viewerMemberId: "agent:trusted",
            channelId: "channel",
            content: "done",
          },
        });
      },
    );
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
        agentHost: {
          jobId: "job",
          taskId: "job",
          channelKind: "channel",
        },
        agent: { id: "trusted", memberId: "agent:trusted" },
      }),
      expect.any(Function),
    );
  });

  it("rejects provider stream errors instead of completing the job", async () => {
    const runtime = {
      startChat: async (
        _request: unknown,
        emit: (event: LocalAIStreamEvent) => void,
      ) => {
        emit({
          type: "error",
          requestId: "request",
          error: { name: "ProviderError", message: "model unavailable" },
        });
      },
    } as unknown as LocalAIRuntimeService;
    const bridge = {
      request: vi.fn(async () => ({
        request: {
          requestId: "request",
          turnId: "turn",
          conversationId: "trusted-conversation",
          providerId: "codex-cli",
          operation: { kind: "bootstrap", messages: [] },
          agent: { id: "trusted", memberId: "agent:trusted" },
        },
      })),
    } as unknown as AgentHostRendererBridge;

    await expect(
      new LocalAiAgentHostExecutor(runtime, bridge).execute(job, vi.fn()),
    ).rejects.toThrow("model unavailable");
  });

  it("rejects a silent direct offer but permits an open-floor pass", async () => {
    const runtime = {
      startChat: async () => undefined,
    } as unknown as LocalAIRuntimeService;
    const bridge = {
      request: vi.fn(async () => ({
        request: {
          requestId: "request",
          turnId: "turn",
          conversationId: "trusted-conversation",
          providerId: "codex-cli",
          operation: { kind: "bootstrap", messages: [] },
          agent: { id: "trusted", memberId: "agent:trusted" },
        },
      })),
    } as unknown as AgentHostRendererBridge;
    const executor = new LocalAiAgentHostExecutor(runtime, bridge);

    await expect(executor.execute(job, vi.fn())).rejects.toThrow(
      "completed a direct offer without sending a message",
    );
    await expect(
      executor.execute({ ...job, mode: "open-floor" }, vi.fn()),
    ).resolves.toBeUndefined();
  });
});
