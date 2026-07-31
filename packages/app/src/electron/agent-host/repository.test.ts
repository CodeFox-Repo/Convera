import { mkdtemp, rm } from "node:fs/promises";
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
    channelId: "channel",
    conversationId: "conversation",
    triggerMessageId: `message-${id}`,
    agentMemberId: "agent:a",
    chain: { hops: 0, invoked: ["agent:a"] },
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
});
