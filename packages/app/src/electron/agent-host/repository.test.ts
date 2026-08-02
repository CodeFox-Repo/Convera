import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentHostJob } from "@/shared/types/agent-host";
import { JsonAgentHostJobRepository } from "./repository";

const temporaryDirectories: string[] = [];

function job(id: string, status: AgentHostJob["status"]): AgentHostJob {
  const timestamp = new Date(
    1_750_000_000_000 + Number(id) * 1_000,
  ).toISOString();
  return {
    id,
    taskId: id,
    channelId: "channel",
    channelKind: "channel",
    conversationId: "conversation",
    triggerMessageId: `message-${id}`,
    contextMessageIds: [`message-${id}`],
    mode: "direct",
    offeredAgentMemberIds: ["agent:a"],
    agentId: "a",
    agentMemberId: "agent:a",
    chain: { hops: 0, invoked: ["agent:a"] },
    controlInstructions: [],
    status,
    attempts: status === "queued" ? 0 : 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("JsonAgentHostJobRepository", () => {
  it("round-trips jobs and updates by stable id", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-agent-host-"));
    temporaryDirectories.push(directory);
    const repository = new JsonAgentHostJobRepository({
      path: join(directory, "jobs.json"),
    });
    await repository.put(job("1", "queued"));
    await repository.put(job("1", "completed"));

    expect(await repository.list()).toEqual([job("1", "completed")]);
  });

  it("persists structured task provenance and Dexie result receipts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-agent-host-"));
    temporaryDirectories.push(directory);
    const repository = new JsonAgentHostJobRepository({
      path: join(directory, "jobs.json"),
    });
    const delegated: AgentHostJob = {
      ...job("1", "completed"),
      parentTaskId: "parent-task",
      outputMessageIds: ["message-result"],
      maxOutputTokens: 2_000,
      collaboration: {
        kind: "delegation",
        operationId: "delegation-1",
        idempotencyKey: "delegate-1",
        inputHash: "hash-1",
        sourceTaskId: "parent-task",
        sourceJobId: "parent-job",
        fromMemberId: "agent:planner",
        depth: 1,
        path: ["agent:planner", "agent:a"],
        brief: {
          objective: "Review the implementation",
          acceptanceCriteria: ["Post blockers"],
          contextMessageIds: ["message-1"],
          outputContract: { format: "text", description: "Review" },
        },
      },
    };

    await repository.put(delegated);
    expect(await repository.list()).toEqual([delegated]);
  });

  it("prunes only the oldest terminal jobs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-agent-host-"));
    temporaryDirectories.push(directory);
    const repository = new JsonAgentHostJobRepository({
      path: join(directory, "jobs.json"),
      maxTerminalJobs: 1,
    });
    await repository.put(job("1", "completed"));
    await repository.put(job("2", "failed"));
    await repository.put(job("3", "queued"));

    expect((await repository.list()).map(({ id }) => id).sort()).toEqual([
      "2",
      "3",
    ]);
  });

  it("migrates legacy queued work to interrupted instead of replaying it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-agent-host-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "jobs.json");
    const current = job("1", "queued");
    const v1 = {
      id: current.id,
      channelId: current.channelId,
      conversationId: current.conversationId,
      triggerMessageId: current.triggerMessageId,
      agentMemberId: current.agentMemberId,
      chain: current.chain,
      status: current.status,
      attempts: current.attempts,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    };
    await writeFile(
      path,
      JSON.stringify({ schemaVersion: 1, jobs: [v1] }),
      "utf8",
    );
    const repository = new JsonAgentHostJobRepository({ path });

    expect(await repository.list()).toEqual([
      expect.objectContaining({
        id: "1",
        status: "interrupted",
        contextMessageIds: ["message-1"],
        error: expect.stringContaining("predates frozen offer context"),
      }),
    ]);
  });

  it("migrates version two jobs into stable tasks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-agent-host-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "jobs.json");
    const current = job("1", "completed");
    const versionTwoJob: Partial<AgentHostJob> = { ...current };
    delete versionTwoJob.taskId;
    delete versionTwoJob.channelKind;
    delete versionTwoJob.controlInstructions;
    await writeFile(
      path,
      JSON.stringify({ schemaVersion: 2, jobs: [versionTwoJob] }),
      "utf8",
    );

    expect(await new JsonAgentHostJobRepository({ path }).list()).toEqual([
      expect.objectContaining({
        id: "1",
        taskId: "1",
        channelKind: "channel",
        controlInstructions: [],
      }),
    ]);
  });
});
