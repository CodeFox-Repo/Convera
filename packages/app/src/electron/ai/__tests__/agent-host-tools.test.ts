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

function input(channelKind: "channel" | "dm"): LocalAiTurnHookInput {
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
      agentHost: { jobId: "dm-job", taskId: "dm-task", channelKind },
    },
    prepared: {} as LocalAiTurnHookInput["prepared"],
    requestInteraction: async () => ({}),
  };
}

describe("Agent Host task tools", () => {
  it("injects one private task tool only into agent DMs", async () => {
    const host = {
      listTasks: vi.fn(async () => [task]),
    } as unknown as AgentHost;
    const hooks = withAgentHostTools({}, () => host);

    const dm = await hooks.prepareTurnContext?.(input("dm"));
    const channel = await hooks.prepareTurnContext?.(input("channel"));

    expect(dm?.additionalTools?.map((tool) => tool.qualifiedName)).toEqual([
      "task:manage_task",
    ]);
    expect(dm?.systemContext).toContain("private direct conversation");
    expect(channel).toBeUndefined();
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
});
