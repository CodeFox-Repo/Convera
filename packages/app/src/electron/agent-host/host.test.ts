import { describe, expect, it, vi } from "vitest";
import type {
  AgentHostJob,
  SettledAgentHostTurn,
} from "@/shared/types/agent-host";
import { AgentHost, type AgentHostExecutor } from "./host";
import { InMemoryAgentHostJobRepository } from "./repository";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const settled: SettledAgentHostTurn = {
  assistantContent: "done",
  triggerMessageId: "assistant-message",
  followupAgentMemberIds: [],
  chain: { hops: 0, invoked: ["agent:a"] },
  limitReached: false,
};

function dispatch(conversationId: string, agentMemberIds = ["agent:a"]) {
  return {
    channelId: `channel:${conversationId}`,
    conversationId,
    triggerMessageId: `message:${conversationId}`,
    agentMemberIds,
    chain: { hops: 0, invoked: [...agentMemberIds] },
  };
}

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  assertion();
}

describe("AgentHost", () => {
  it("deduplicates one trigger/actor pair", async () => {
    const execute = vi.fn(async () => settled);
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute },
      createId: () => "job-1",
    });
    const first = await host.enqueue(dispatch("c1"));
    const second = await host.enqueue(dispatch("c1"));

    expect(second[0].id).toBe(first[0].id);
    await eventually(() => expect(execute).toHaveBeenCalledOnce());
  });

  it("rejects targets that were not admitted by the bounded mention chain", async () => {
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute: async () => settled },
    });
    await expect(
      host.enqueue({
        ...dispatch("c1"),
        agentMemberIds: ["agent:forged"],
      }),
    ).rejects.toThrow("Invalid Agent Host dispatch");
  });

  it("holds recovered and new work until the renderer announces readiness", async () => {
    const execute = vi.fn(async () => settled);
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute },
      startPaused: true,
    });
    await host.enqueue(dispatch("c1"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(execute).not.toHaveBeenCalled();

    host.start();
    await eventually(() => expect(execute).toHaveBeenCalledOnce());
  });

  it("surfaces executor failures without stopping later channels", async () => {
    const execute = vi
      .fn<AgentHostExecutor["execute"]>()
      .mockRejectedValueOnce(new Error("Codex CLI is missing"))
      .mockResolvedValue(settled);
    let sequence = 0;
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute },
      createId: () => `job-${++sequence}`,
    });
    await host.enqueue(dispatch("broken"));
    await host.enqueue(dispatch("healthy"));

    await eventually(() => expect(execute).toHaveBeenCalledTimes(2));
    await vi.waitFor(async () => {
      expect(await host.listJobs()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "job-1",
            status: "failed",
            error: "Codex CLI is missing",
          }),
          expect.objectContaining({ id: "job-2", status: "completed" }),
        ]),
      );
    });
  });

  it("serializes jobs in one conversation and runs other channels concurrently", async () => {
    const gates = new Map<
      string,
      ReturnType<typeof deferred<SettledAgentHostTurn>>
    >();
    const execute = vi.fn((job: AgentHostJob) => {
      const gate = deferred<SettledAgentHostTurn>();
      gates.set(job.id, gate);
      return gate.promise;
    });
    let sequence = 0;
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute },
      maxConcurrency: 2,
      createId: () => `job-${++sequence}`,
    });
    await host.enqueue(dispatch("same", ["agent:a", "agent:b"]));
    await host.enqueue(dispatch("other", ["agent:c"]));

    await eventually(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(
      execute.mock.calls.map(([job]) => job.conversationId).sort(),
    ).toEqual(["other", "same"]);

    gates.get("job-1")?.resolve(settled);
    await eventually(() => expect(execute).toHaveBeenCalledTimes(3));
    gates.get("job-2")?.resolve(settled);
    gates.get("job-3")?.resolve(settled);
  });

  it("does not replay a running job recovered after restart", async () => {
    const timestamp = new Date().toISOString();
    const running: AgentHostJob = {
      id: "running",
      channelId: "channel",
      conversationId: "conversation",
      triggerMessageId: "message",
      agentMemberId: "agent:a",
      chain: { hops: 0, invoked: ["agent:a"] },
      status: "running",
      attempts: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const repository = new InMemoryAgentHostJobRepository([running]);
    const execute = vi.fn(async () => settled);
    const host = new AgentHost({ repository, executor: { execute } });
    await host.initialize();

    expect(execute).not.toHaveBeenCalled();
    expect((await host.listJobs())[0]).toMatchObject({
      status: "interrupted",
      error: expect.stringContaining("not replayed"),
    });
  });

  it("queues callback mentions returned by a completed agent", async () => {
    const execute = vi
      .fn<AgentHostExecutor["execute"]>()
      .mockResolvedValueOnce({
        assistantContent: "@B please continue",
        triggerMessageId: "assistant-a",
        followupAgentMemberIds: ["agent:b"],
        chain: { hops: 1, invoked: ["agent:a", "agent:b"] },
        limitReached: false,
      })
      .mockResolvedValue(settled);
    let sequence = 0;
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute },
      createId: () => `job-${++sequence}`,
    });
    await host.enqueue(dispatch("c1"));

    await eventually(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute.mock.calls[1][0]).toMatchObject({
      agentMemberId: "agent:b",
      triggerMessageId: "assistant-a",
    });
  });
});
