import { describe, expect, it, vi } from "vitest";
import type {
  AgentHostDispatch,
  AgentHostJob,
} from "@/shared/types/agent-host";
import { AgentHost, type AgentHostExecutor } from "./host";
import { InMemoryAgentHostJobRepository } from "./repository";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function dispatch(
  conversationId: string,
  members = ["agent:a"],
  triggerMessageId = `message:${conversationId}`,
): AgentHostDispatch {
  return {
    channelId: `channel:${conversationId}`,
    conversationId,
    triggerMessageId,
    contextMessageIds: [triggerMessageId],
    mode: members.length > 1 ? "open-floor" : "direct",
    offeredAgentMemberIds: [...members],
    targets: members.map((memberId) => ({
      memberId,
      agentId: memberId.slice("agent:".length),
    })),
    chain: { hops: 0, invoked: [...members] },
  };
}

function storedJob(status: AgentHostJob["status"]): AgentHostJob {
  return {
    id: "stored",
    channelId: "channel:c1",
    conversationId: "c1",
    triggerMessageId: "message:c1",
    contextMessageIds: ["message:c1"],
    mode: "direct",
    offeredAgentMemberIds: ["agent:a"],
    agentId: "a",
    agentMemberId: "agent:a",
    chain: { hops: 0, invoked: ["agent:a"] },
    status,
    attempts: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("AgentHost", () => {
  it("deduplicates the same trigger and actor", async () => {
    const execute = vi.fn(async () => undefined);
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute },
      startPaused: true,
      createId: () => "job-1",
    });
    const first = await host.enqueue(dispatch("c1"));
    const second = await host.enqueue(dispatch("c1"));
    expect(second[0].id).toBe(first[0].id);
    expect(await host.listJobs()).toHaveLength(1);
  });

  it("rejects an offer without its frozen trigger boundary", async () => {
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute: async () => undefined },
    });
    await expect(
      host.enqueue({
        ...dispatch("c1"),
        contextMessageIds: ["different"],
      }),
    ).rejects.toThrow("Invalid Agent Host dispatch");
  });

  it("runs different actors in one conversation concurrently", async () => {
    const gates = new Map<string, ReturnType<typeof deferred<void>>>();
    const execute = vi.fn((job: AgentHostJob) => {
      const gate = deferred<void>();
      gates.set(job.agentMemberId, gate);
      return gate.promise;
    });
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute },
      maxConcurrency: 3,
    });
    await host.enqueue(dispatch("same", ["agent:a", "agent:b"]));
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    gates.get("agent:a")?.resolve();
    gates.get("agent:b")?.resolve();
  });

  it("serializes one actor while allowing another actor to work", async () => {
    const gates = new Map<string, ReturnType<typeof deferred<void>>>();
    const execute = vi.fn((job: AgentHostJob) => {
      const gate = deferred<void>();
      gates.set(job.id, gate);
      return gate.promise;
    });
    let nextId = 0;
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute },
      maxConcurrency: 3,
      createId: () => `job-${++nextId}`,
    });
    await host.enqueue(dispatch("same", ["agent:a"], "message:one"));
    await host.enqueue(dispatch("same", ["agent:a"], "message:two"));
    await host.enqueue(dispatch("same", ["agent:b"], "message:three"));
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute.mock.calls.map(([job]) => job.agentMemberId)).toEqual([
      "agent:a",
      "agent:b",
    ]);
    gates.get("job-1")?.resolve();
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(3));
    gates.get("job-2")?.resolve();
    gates.get("job-3")?.resolve();
  });

  it("marks a running job interrupted instead of replaying it", async () => {
    const running = storedJob("running");
    const repository = new InMemoryAgentHostJobRepository([running]);
    const execute = vi.fn(async () => undefined);
    const host = new AgentHost({ repository, executor: { execute } });
    await host.initialize();
    expect((await host.listJobs())[0]).toMatchObject({
      status: "interrupted",
      attempts: 1,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("cancels the exact running provider request", async () => {
    const gate = deferred<void>();
    const cancel = vi.fn(async () => {
      gate.resolve();
      return true;
    });
    const executor: AgentHostExecutor = {
      execute: () => gate.promise,
      cancel,
    };
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor,
      createId: () => "job-1",
    });
    await host.enqueue(dispatch("c1"));
    await vi.waitFor(async () =>
      expect((await host.listJobs())[0].status).toBe("running"),
    );
    expect(await host.cancel("job-1")).toBe(true);
    expect(cancel).toHaveBeenCalledWith(
      expect.objectContaining({ agentMemberId: "agent:a" }),
    );
    expect((await host.listJobs())[0].status).toBe("cancelled");
  });
});
