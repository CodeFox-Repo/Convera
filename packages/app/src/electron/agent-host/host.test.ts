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
    channelKind: "channel",
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
    taskId: "stored",
    channelId: "channel:c1",
    channelKind: "channel",
    conversationId: "c1",
    triggerMessageId: "message:c1",
    contextMessageIds: ["message:c1"],
    mode: "direct",
    offeredAgentMemberIds: ["agent:a"],
    agentId: "a",
    agentMemberId: "agent:a",
    chain: { hops: 0, invoked: ["agent:a"] },
    controlInstructions: [],
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

  it("accepts an open-floor dispatch whose chain booked nobody", async () => {
    // An open floor offers the room to everyone without spending anyone's
    // once-per-chain slot, so `invoked` is empty while `targets` is not.
    // Validating targets against `invoked` rejected every such dispatch.
    const jobs: AgentHostJob[] = [];
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: {
        execute: async (job) => {
          jobs.push(job);
        },
      },
    });
    await host.enqueue({
      ...dispatch("c1", ["agent:a", "agent:b"]),
      chain: { hops: 0, invoked: [] },
    });
    await vi.waitFor(() => expect(jobs).toHaveLength(2));
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

  it("makes one colleague finish a room before starting another", async () => {
    // A person called into two rooms answers one and then the other, carrying
    // the first into the second. Keying the queue by room ran the same
    // colleague twice at once, which is how one agent ended up holding two
    // unrelated provider sessions and forgetting what it had just said.
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

    await host.enqueue(dispatch("general", ["agent:a"], "message:one"));
    await host.enqueue(dispatch("dm-with-you", ["agent:a"], "message:two"));

    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0][0].conversationId).toBe("general");

    // The second room must still be waiting: with a per-room key both ran at
    // once and this count was already 2.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(execute).toHaveBeenCalledTimes(1);

    gates.get("job-1")?.resolve();
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute.mock.calls[1][0].conversationId).toBe("dm-with-you");
    gates.get("job-2")?.resolve();
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

  it("pauses and resumes one task without changing its stable identity", async () => {
    const gates = [deferred<void>(), deferred<void>()];
    const execute = vi.fn(() => gates[execute.mock.calls.length - 1].promise);
    const cancel = vi.fn(async () => {
      gates[0].resolve();
      return true;
    });
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute, cancel },
      createId: () => "task-1",
    });
    const [job] = await host.enqueue(dispatch("c1"));
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());

    expect(await host.pauseTask(job.taskId)).toBe(true);
    expect((await host.listTasks())[0]).toMatchObject({
      id: "task-1",
      status: "paused",
      runCount: 1,
    });
    expect(await host.resumeTask(job.taskId)).toBe(true);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect((await host.listTasks())[0].id).toBe("task-1");
    gates[1].resolve();
  });

  it("keeps a running task live when its provider refuses to pause", async () => {
    const gate = deferred<void>();
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: {
        execute: () => gate.promise,
        cancel: async () => false,
      },
      createId: () => "task-1",
    });
    const [job] = await host.enqueue(dispatch("c1"));
    await vi.waitFor(async () =>
      expect((await host.listTasks())[0].status).toBe("running"),
    );

    expect(await host.pauseTask(job.taskId)).toBe(false);
    expect((await host.listTasks())[0].status).toBe("running");
    gate.resolve();
    await vi.waitFor(async () =>
      expect((await host.listTasks())[0].status).toBe("completed"),
    );
  });

  it("redirects a task into a replacement run with private guidance", async () => {
    const ids = ["z-original", "a-replacement"];
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute: async () => undefined },
      startPaused: true,
      createId: () => ids.shift() as string,
    });
    const [original] = await host.enqueue(dispatch("c1"));
    const replacement = await host.redirectTask(
      original.taskId,
      "Show me the diff before opening a PR.",
    );

    expect(replacement).toMatchObject({
      id: "a-replacement",
      taskId: "z-original",
      parentJobId: "z-original",
      status: "queued",
      controlInstructions: ["Show me the diff before opening a PR."],
    });
    expect(await host.listTasks()).toEqual([
      expect.objectContaining({
        id: "z-original",
        currentJobId: "a-replacement",
        runCount: 2,
        status: "queued",
      }),
    ]);
    expect(
      (await host.listJobs()).find((entry) => entry.id === "z-original"),
    ).toMatchObject({ status: "cancelled" });
  });

  it("serializes simultaneous redirects into one replacement chain", async () => {
    const ids = ["original", "replacement-1", "replacement-2"];
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute: async () => undefined },
      startPaused: true,
      createId: () => ids.shift() as string,
    });
    const [original] = await host.enqueue(dispatch("c1"));

    await Promise.all([
      host.redirectTask(original.taskId, "First guidance"),
      host.redirectTask(original.taskId, "Second guidance"),
    ]);

    expect(await host.listTasks()).toEqual([
      expect.objectContaining({
        currentJobId: "replacement-2",
        runCount: 3,
        controlInstructions: ["First guidance", "Second guidance"],
      }),
    ]);
    expect(
      (await host.listJobs()).find((job) => job.id === "replacement-2"),
    ).toMatchObject({ parentJobId: "replacement-1" });
  });

  it("does not let one agent control another agent's task", async () => {
    const host = new AgentHost({
      repository: new InMemoryAgentHostJobRepository(),
      executor: { execute: async () => undefined },
      startPaused: true,
      createId: () => "task-a",
    });
    const [job] = await host.enqueue(dispatch("c1", ["agent:a"]));

    expect(await host.pauseTask(job.taskId, "agent:b")).toBe(false);
    await expect(
      host.redirectTask(job.taskId, "Change direction", "agent:b"),
    ).rejects.toThrow("not found for this agent");
  });

  it("delegates bounded child tasks, waits for Dexie result receipts, and replays idempotently", async () => {
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
      createId: () => `structured-${++nextId}`,
    });
    const [source] = await host.enqueue(dispatch("c1", ["agent:a"]));
    await vi.waitFor(async () =>
      expect((await host.listJobs())[0].status).toBe("running"),
    );

    const request = {
      sourceJobId: source.id,
      sourceTaskId: source.taskId,
      callerMemberId: "agent:a",
      idempotencyKey: "delegate-1",
      inputHash: "same-input",
      ttlSeconds: 60,
      delegates: ["b", "c"].map((id) => ({
        target: { agentId: id, memberId: `agent:${id}` },
        brief: {
          objective: `Research ${id}`,
          acceptanceCriteria: ["Post evidence"],
          contextMessageIds: [source.triggerMessageId],
          outputContract: { format: "text" as const, description: "Findings" },
        },
      })),
    };
    const created = await host.delegateTask(request);
    const replay = await host.delegateTask(request);
    expect(replay.operationId).toBe(created.operationId);
    expect(replay.jobs.map((job) => job.id)).toEqual(
      created.jobs.map((job) => job.id),
    );
    await expect(
      host.delegateTask({ ...request, inputHash: "changed-input" }),
    ).rejects.toThrow("different input");
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(3));

    const outcomePromise = host.waitForDelegation(created.operationId, {
      strategy: "all",
      cancelRemainingOnSatisfied: true,
      timeoutMs: 5_000,
    });
    for (const child of created.jobs) {
      expect(
        await host.recordOutput(child.id, `message:${child.agentId}`),
      ).toBe(true);
      gates.get(child.id)?.resolve();
    }
    const outcome = await outcomePromise;

    expect(outcome.joinStatus).toBe("satisfied");
    expect(outcome.jobs).toEqual([
      expect.objectContaining({
        parentTaskId: source.taskId,
        status: "completed",
        outputMessageIds: ["message:b"],
      }),
      expect.objectContaining({
        parentTaskId: source.taskId,
        status: "completed",
        outputMessageIds: ["message:c"],
      }),
    ]);
    expect((await host.listTasks("agent:a"))[0].id).toBe(source.taskId);
    gates.get(source.id)?.resolve();
  });

  it("hands off the stable task identity and removes control from the former owner", async () => {
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
      maxConcurrency: 2,
      createId: () => `handoff-${++nextId}`,
    });
    const [source] = await host.enqueue(dispatch("c1", ["agent:a"]));
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    const request = {
      sourceJobId: source.id,
      sourceTaskId: source.taskId,
      callerMemberId: "agent:a",
      idempotencyKey: "handoff-1",
      inputHash: "same-input",
      target: { agentId: "b", memberId: "agent:b" },
      brief: {
        objective: "Own the rest of the task",
        acceptanceCriteria: ["Finish it"],
        contextMessageIds: [],
        outputContract: { format: "text" as const, description: "Result" },
      },
    };
    const committed = await host.handoffTask(request);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));

    expect(committed.job).toMatchObject({
      taskId: source.taskId,
      parentJobId: source.id,
      agentMemberId: "agent:b",
      collaboration: { kind: "handoff", fromMemberId: "agent:a" },
    });
    expect(await host.listTasks("agent:a")).toEqual([]);
    expect(await host.listTasks("agent:b")).toEqual([
      expect.objectContaining({ id: source.taskId, agentMemberId: "agent:b" }),
    ]);
    expect(await host.pauseTask(source.taskId, "agent:a")).toBe(false);
    expect((await host.handoffTask(request)).job.id).toBe(committed.job.id);
    await expect(
      host.handoffTask({
        ...request,
        sourceJobId: committed.job.id,
        callerMemberId: "agent:b",
        idempotencyKey: "handoff-back",
        inputHash: "handoff-back",
        target: { agentId: "a", memberId: "agent:a" },
      }),
    ).rejects.toThrow("repeat an agent");

    gates.get(committed.job.id)?.resolve();
    gates.get(source.id)?.resolve();
  });
});
