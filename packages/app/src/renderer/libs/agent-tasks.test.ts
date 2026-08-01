import { describe, expect, it } from "vitest";
import type {
  AgentHostJobStatus,
  AgentHostTaskSummary,
} from "@/shared/types/agent-host";
import { openAgentTasks, taskStatusLabel } from "./agent-tasks";

function task(
  overrides: Partial<AgentHostTaskSummary> & { id: string },
): AgentHostTaskSummary {
  return {
    channelId: "channel-1",
    channelKind: "channel",
    conversationId: "conversation-1",
    triggerMessageId: "message-1",
    agentId: "agent-1",
    agentMemberId: "agent:agent-1",
    currentJobId: overrides.id,
    status: "running",
    runCount: 1,
    controlInstructions: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("openAgentTasks", () => {
  it("drops finished work and private conversations", () => {
    const terminal: AgentHostJobStatus[] = [
      "completed",
      "failed",
      "cancelled",
      "interrupted",
    ];
    const open = openAgentTasks([
      ...terminal.map((status) => task({ id: status, status })),
      task({ id: "dm", channelKind: "dm" }),
      task({ id: "live" }),
    ]);
    expect(open.map((entry) => entry.id)).toEqual(["live"]);
  });

  it("puts what is happening now above what is waiting or held", () => {
    const open = openAgentTasks([
      task({ id: "paused", status: "paused" }),
      task({ id: "queued", status: "queued" }),
      task({ id: "running", status: "running" }),
    ]);
    expect(open.map((entry) => entry.id)).toEqual([
      "running",
      "queued",
      "paused",
    ]);
  });

  it("orders same-status work newest first", () => {
    const open = openAgentTasks([
      task({ id: "older", updatedAt: "2026-01-01T00:00:00.000Z" }),
      task({ id: "newer", updatedAt: "2026-02-01T00:00:00.000Z" }),
    ]);
    expect(open.map((entry) => entry.id)).toEqual(["newer", "older"]);
  });
});

describe("taskStatusLabel", () => {
  it("says what a colleague is doing, not what the queue calls it", () => {
    expect(taskStatusLabel("running")).toBe("Working");
    expect(taskStatusLabel("queued")).toBe("Queued");
    expect(taskStatusLabel("paused")).toBe("Paused");
  });
});
