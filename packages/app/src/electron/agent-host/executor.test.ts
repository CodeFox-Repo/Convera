import { describe, expect, it, vi } from "vitest";
import type { AgentHostJob } from "@/shared/types/agent-host";
import type {
  LocalAIChatRequest,
  LocalAIRuntimeService,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import type { AgentHostRendererBridge } from "./renderer-bridge";
import { LocalAiAgentHostExecutor } from "./executor";
import { AgentHost } from "./host";
import { InMemoryAgentHostJobRepository } from "./repository";

/** Prepares a turn whose transcript is one direct question, unanswered. */
function silentBridge(): AgentHostRendererBridge {
  return {
    request: vi.fn(async () => ({
      request: {
        requestId: "request",
        turnId: "turn",
        conversationId: "trusted-conversation",
        providerId: "codex-cli",
        operation: {
          kind: "bootstrap",
          messages: [{ role: "user", content: "@trusted are you there?" }],
        },
        agent: { id: "trusted", memberId: "agent:trusted" },
      },
    })),
  } as unknown as AgentHostRendererBridge;
}

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
    const startChat = vi.fn(async () => undefined);
    const runtime = { startChat } as unknown as LocalAIRuntimeService;
    const executor = new LocalAiAgentHostExecutor(runtime, silentBridge());

    await expect(executor.execute(job, vi.fn())).rejects.toThrow(
      "completed a direct offer without sending a message",
    );
    // Asked twice before giving up; an open floor is asked once.
    expect(startChat).toHaveBeenCalledTimes(2);
    startChat.mockClear();
    await expect(
      executor.execute({ ...job, mode: "open-floor" }, vi.fn()),
    ).resolves.toBeUndefined();
    expect(startChat).toHaveBeenCalledTimes(1);
  });

  it("re-asks a silent direct offer and accepts a message the second time", async () => {
    const requests: LocalAIChatRequest[] = [];
    const startChat = vi.fn(
      async (
        request: LocalAIChatRequest,
        emit: (event: LocalAIStreamEvent) => void,
      ) => {
        requests.push(request);
        if (requests.length === 1) return;
        emit({
          type: "interaction",
          requestId: request.requestId,
          interactionId: "interaction",
          kind: "input",
          name: "workspace:query",
          prompt: "Send a message",
          input: {
            kind: "send_message",
            viewerMemberId: "agent:trusted",
            channelId: "channel",
            content: "heard you",
          },
        });
      },
    );
    const runtime = { startChat } as unknown as LocalAIRuntimeService;

    await expect(
      new LocalAiAgentHostExecutor(runtime, silentBridge()).execute(
        job,
        vi.fn(),
      ),
    ).resolves.toBeUndefined();

    expect(requests).toHaveLength(2);
    // Same request id — the renderer routes tool answers and the typing
    // indicator by it — but a new turn, and a rebase, because the first turn
    // already advanced the shared transcript.
    expect(requests[1].requestId).toBe(requests[0].requestId);
    expect(requests[1].turnId).not.toBe(requests[0].turnId);
    expect(requests[1].operation).toMatchObject({
      kind: "rebase",
      reason: "regenerate",
    });
    const messages =
      requests[1].operation.kind === "rebase"
        ? requests[1].operation.messages
        : [];
    expect(messages.at(-1)?.content).toContain("nobody heard you");
    expect(messages.slice(0, -1)).toEqual([
      { role: "user", content: "@trusted are you there?" },
    ]);
  });

  it("persists the normal prepare, provider-effect, and finalize path", async () => {
    const runtime = {
      startChat: async (
        request: LocalAIChatRequest,
        emit: (event: LocalAIStreamEvent) => void,
      ) => {
        emit({
          type: "interaction",
          requestId: request.requestId,
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
    } as unknown as LocalAIRuntimeService;
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: new LocalAiAgentHostExecutor(runtime, silentBridge()),
      createId: () => "durable-job",
    });

    await host.enqueue({
      channelId: "channel",
      channelKind: "channel",
      conversationId: "trusted-conversation",
      triggerMessageId: "message",
      contextMessageIds: ["message"],
      mode: "direct",
      offeredAgentMemberIds: ["agent:trusted"],
      targets: [{ agentId: "trusted", memberId: "agent:trusted" }],
      chain: { hops: 0, invoked: ["agent:trusted"] },
    });
    await vi.waitFor(async () =>
      expect((await host.listJobs())[0].status).toBe("completed"),
    );

    const completed = (await host.listJobs())[0];
    expect(completed.workflow).toMatchObject({
      checkpoint: { step: 3, next: [] },
      effects: [
        expect.objectContaining({
          kind: "provider-turn",
          status: "committed",
          receipt: { spoke: true, next: ["finalize"] },
        }),
      ],
    });
    expect(completed.workflow?.checkpoints.map(({ next }) => next)).toEqual([
      ["prepare-turn"],
      ["provider-turn"],
      ["finalize"],
      [],
    ]);
  });
});
