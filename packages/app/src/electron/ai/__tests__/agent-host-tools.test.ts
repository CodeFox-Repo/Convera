import { describe, expect, it, vi } from "vitest";
import type { AgentHost } from "@/electron/agent-host/host";
import type {
  AgentHostJob,
  AgentHostTaskSummary,
} from "@/shared/types/agent-host";
import type { LocalAiTurnHookInput } from "../runtime";
import { withAgentHostTools } from "../agent-host-tools";

const task: AgentHostTaskSummary = {
  id: "task-1",
  channelId: "channel-1",
  channelKind: "channel",
  conversationId: "conversation-1",
  triggerMessageId: "message-1",
  agentId: "fizz",
  agentMemberId: "agent:fizz",
  currentJobId: "job-1",
  status: "running",
  runCount: 1,
  controlInstructions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function input(
  channelKind: "channel" | "dm",
  collaborationTargets?: Array<{ agentId: string; memberId: string }>,
): LocalAiTurnHookInput {
  return {
    request: {
      requestId: "request",
      conversationId: "conversation",
      turnId: "turn",
      providerId: "codex-cli",
      operation: {
        kind: "append",
        message: { role: "user", content: "Control the task" },
      },
      agent: { id: "fizz", memberId: "agent:fizz" },
      agentHost: {
        jobId: "dm-job",
        taskId: "dm-task",
        channelKind,
        collaborationTargets,
      },
    },
    prepared: {} as LocalAiTurnHookInput["prepared"],
    requestInteraction: async () => ({}),
  };
}

describe("Agent Host task tools", () => {
  it("preserves lifecycle hooks while adding task tools", async () => {
    const prepareDurableTurnHook = vi.fn(() => undefined);
    const replayDurableTurnHook = vi.fn(() => undefined);
    const onTurnCompleted = vi.fn(() => undefined);
    const onTurnFailed = vi.fn(() => undefined);
    const hooks = withAgentHostTools(
      {
        prepareDurableTurnHook,
        replayDurableTurnHook,
        onTurnCompleted,
        onTurnFailed,
      },
      () => undefined,
    );

    await hooks.prepareDurableTurnHook?.(undefined as never);
    await hooks.replayDurableTurnHook?.(undefined as never);
    await hooks.onTurnCompleted?.(undefined as never);
    await hooks.onTurnFailed?.(undefined as never);

    expect(prepareDurableTurnHook).toHaveBeenCalledOnce();
    expect(replayDurableTurnHook).toHaveBeenCalledOnce();
    expect(onTurnCompleted).toHaveBeenCalledOnce();
    expect(onTurnFailed).toHaveBeenCalledOnce();
  });

  it("injects one task tool wherever the agent is standing", async () => {
    const host = {
      listTasks: vi.fn(async () => [task]),
    } as unknown as AgentHost;
    const hooks = withAgentHostTools({}, () => host);

    const dm = await hooks.prepareTurnContext?.(input("dm"));
    const channel = await hooks.prepareTurnContext?.(input("channel"));

    for (const prepared of [dm, channel]) {
      expect(
        prepared?.additionalTools?.map((tool) => tool.qualifiedName),
      ).toEqual(["task:manage_task"]);
    }
    expect(dm?.systemContext).toContain("private direct conversation");
    expect(dm?.additionalTools?.[0]?.description).toContain("Redirect stops");
    expect(channel?.systemContext).toContain("list and inspect only");
    expect(channel?.additionalTools?.[0]?.description).toContain(
      "Only list and inspect work here",
    );
  });

  it("reads its own workload from a channel but refuses lifecycle verbs there", async () => {
    const host = {
      listTasks: vi.fn(async () => [task]),
      cancelTask: vi.fn(async () => true),
      redirectTask: vi.fn(),
    } as unknown as AgentHost;
    const prepared = await withAgentHostTools(
      {},
      () => host,
    ).prepareTurnContext?.(input("channel"));
    const tool = prepared?.additionalTools?.[0];

    expect(await tool?.execute({ action: "list" })).toMatchObject({
      ok: true,
      tasks: [{ task_id: "task-1" }],
    });
    expect(
      await tool?.execute({ action: "inspect", task_id: "task-1" }),
    ).toMatchObject({ ok: true, task: { id: "task-1" } });
    for (const action of ["pause", "resume", "cancel", "redirect"]) {
      expect(
        await tool?.execute({
          action,
          task_id: "task-1",
          instruction: "Stop early.",
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "TASK_CONTROL_UNAVAILABLE" },
      });
    }
    expect(host.cancelTask).not.toHaveBeenCalled();
    expect(host.redirectTask).not.toHaveBeenCalled();
  });

  it("lists only non-DM tasks owned by the speaking agent", async () => {
    const host = {
      listTasks: vi.fn(async () => [
        task,
        { ...task, id: "dm-task", channelKind: "dm" },
      ]),
    } as unknown as AgentHost;
    const prepared = await withAgentHostTools(
      {},
      () => host,
    ).prepareTurnContext?.(input("dm"));
    const tool = prepared?.additionalTools?.[0];

    expect(await tool?.execute({ action: "list" })).toMatchObject({
      ok: true,
      tasks: [{ task_id: "task-1", channel_id: "channel-1" }],
    });
    expect(host.listTasks).toHaveBeenCalledWith("agent:fizz");
  });

  it("passes redirect guidance through the ownership fence", async () => {
    const successor = {
      id: "job-2",
      taskId: "task-1",
      status: "queued",
    } as AgentHostJob;
    const host = {
      listTasks: vi.fn(async () => [task]),
      redirectTask: vi.fn(async () => successor),
    } as unknown as AgentHost;
    const prepared = await withAgentHostTools(
      {},
      () => host,
    ).prepareTurnContext?.(input("dm"));
    const tool = prepared?.additionalTools?.[0];

    expect(
      await tool?.execute({
        action: "redirect",
        task_id: "task-1",
        instruction: "Do not open the PR until I see the diff.",
      }),
    ).toEqual({
      ok: true,
      task_id: "task-1",
      job_id: "job-2",
      status: "queued",
    });
    expect(host.redirectTask).toHaveBeenCalledWith(
      "task-1",
      "Do not open the PR until I see the diff.",
      "agent:fizz",
    );
  });

  it("registers distinct delegate and handoff tools only with another channel colleague", async () => {
    const host = {
      listTasks: vi.fn(async () => []),
    } as unknown as AgentHost;
    const hooks = withAgentHostTools({}, () => host);
    const channel = await hooks.prepareTurnContext?.(
      input("channel", [
        { agentId: "fizz", memberId: "agent:fizz" },
        { agentId: "reviewer", memberId: "agent:reviewer" },
      ]),
    );
    const dm = await hooks.prepareTurnContext?.(
      input("dm", [
        { agentId: "fizz", memberId: "agent:fizz" },
        { agentId: "reviewer", memberId: "agent:reviewer" },
      ]),
    );

    expect(channel?.additionalTools?.map((tool) => tool.qualifiedName)).toEqual(
      ["task:manage_task", "task:delegate_task", "task:handoff_task"],
    );
    expect(channel?.systemContext).toContain("bounded specialist work");
    expect(dm?.additionalTools?.map((tool) => tool.qualifiedName)).toEqual([
      "task:manage_task",
    ]);
  });

  it("executes delegation through Host and returns final Dexie message receipts", async () => {
    const child = {
      id: "child-job",
      taskId: "child-task",
      agentId: "reviewer",
      agentMemberId: "agent:reviewer",
      status: "completed",
      outputMessageIds: ["message-result"],
      collaboration: { expiresAt: new Date(Date.now() + 60_000).toISOString() },
    } as AgentHostJob;
    const host = {
      listTasks: vi.fn(async () => []),
      delegateTask: vi.fn(async () => ({
        operationId: "delegation-1",
        jobs: [child],
      })),
      waitForDelegation: vi.fn(async () => ({
        operationId: "delegation-1",
        joinStatus: "satisfied",
        jobs: [child],
      })),
    } as unknown as AgentHost;
    const prepared = await withAgentHostTools(
      {},
      () => host,
    ).prepareTurnContext?.(
      input("channel", [
        { agentId: "fizz", memberId: "agent:fizz" },
        { agentId: "reviewer", memberId: "agent:reviewer" },
      ]),
    );
    const tool = prepared?.additionalTools?.find(
      (candidate) => candidate.qualifiedName === "task:delegate_task",
    );

    expect(
      await tool?.execute({
        idempotency_key: "delegate-1",
        delegates: [
          {
            assignee_member_id: "agent:reviewer",
            objective: "Review the implementation",
            acceptance_criteria: ["Report blockers"],
            context_refs: [{ kind: "message", message_id: "message-1" }],
            output_contract: {
              format: "text",
              description: "Post a concise review",
            },
          },
        ],
        join: { strategy: "all" },
        ttl_seconds: 60,
      }),
    ).toMatchObject({
      ok: true,
      delegation_id: "delegation-1",
      join_status: "satisfied",
      child_tasks: [
        {
          task_id: "child-task",
          status: "completed",
          result_message_ids: ["message-result"],
        },
      ],
    });
    expect(host.delegateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceJobId: "dm-job",
        sourceTaskId: "dm-task",
        callerMemberId: "agent:fizz",
        delegates: [
          expect.objectContaining({
            target: { agentId: "reviewer", memberId: "agent:reviewer" },
          }),
        ],
      }),
    );
  });

  it("commits an authorized handoff and refuses unsupported receiver acceptance", async () => {
    const successor = {
      id: "successor",
      taskId: "dm-task",
      agentId: "reviewer",
      agentMemberId: "agent:reviewer",
      status: "queued",
    } as AgentHostJob;
    const host = {
      listTasks: vi.fn(async () => []),
      handoffTask: vi.fn(async () => ({
        operationId: "handoff-1",
        job: successor,
      })),
    } as unknown as AgentHost;
    const prepared = await withAgentHostTools(
      {},
      () => host,
    ).prepareTurnContext?.(
      input("channel", [
        { agentId: "fizz", memberId: "agent:fizz" },
        { agentId: "reviewer", memberId: "agent:reviewer" },
      ]),
    );
    const tool = prepared?.additionalTools?.find(
      (candidate) => candidate.qualifiedName === "task:handoff_task",
    );
    const base = {
      idempotency_key: "handoff-1",
      to_member_id: "agent:reviewer",
      reason: "The reviewer should own the final decision.",
    };

    expect(
      await tool?.execute({ ...base, acceptance: "required" }),
    ).toMatchObject({
      ok: false,
      error: { code: "HANDOFF_ACCEPTANCE_UNAVAILABLE" },
    });
    expect(await tool?.execute(base)).toEqual({
      ok: true,
      handoff_id: "handoff-1",
      task_id: "dm-task",
      from_member_id: "agent:fizz",
      to_member_id: "agent:reviewer",
      status: "committed",
    });
    expect(host.handoffTask).toHaveBeenCalledOnce();
  });
});
