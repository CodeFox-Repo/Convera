import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonMemoryCandidateRepository } from "./candidate-sink";
import type { MemoryCandidate } from "./types";

const directories: string[] = [];
const timestamp = "2026-07-31T00:00:00.000Z";

async function candidatePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "convera-candidates-"));
  directories.push(directory);
  return join(directory, "candidates.json");
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function candidate(
  id: string,
  sourceId: string | undefined = "letta:source-a",
): MemoryCandidate {
  return {
    id,
    sourceId,
    scope: { kind: "conversation", id: "conversation-1" },
    turnId: `turn-1:memory:${id}`,
    provenance: {
      actor: "primary-agent",
      turnId: `turn-1:memory:${id}`,
      timestamp,
    },
    operation: {
      type: "upsert_block",
      label: "decisions",
      value: "Persist candidates before curation.",
    },
  };
}

describe("JsonMemoryCandidateRepository", () => {
  it("atomically persists idempotent candidates across restarts", async () => {
    const path = await candidatePath();
    const repository = new JsonMemoryCandidateRepository({ path });
    await Promise.all([
      repository.enqueue(candidate("1")),
      repository.enqueue(candidate("1")),
      repository.enqueue(candidate("2")),
    ]);

    const recovered = new JsonMemoryCandidateRepository({ path });
    expect(await recovered.listByTurn("turn-1", "letta:source-a")).toEqual([
      expect.objectContaining({ sourceId: "letta:source-a" }),
      expect.objectContaining({ sourceId: "letta:source-a" }),
    ]);
    expect(await readdir(join(path, ".."))).toEqual(["candidates.json"]);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      schemaVersion: 1,
    });

    await recovered.deleteByScope({
      kind: "conversation",
      id: "conversation-1",
    });
    expect(await recovered.listByTurn("turn-1", "letta:source-a")).toEqual([]);
  });

  it("rejects an unsupported schema instead of overwriting it", async () => {
    const path = await candidatePath();
    const invalid = JSON.stringify({
      schemaVersion: 99,
      candidates: [],
    });
    await writeFile(path, invalid, "utf8");
    const repository = new JsonMemoryCandidateRepository({ path });

    await expect(repository.enqueue(candidate("1"))).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(invalid);
  });

  it("isolates duplicate turn and candidate ids by source while quarantining legacy records", async () => {
    const path = await candidatePath();
    const repository = new JsonMemoryCandidateRepository({ path });
    await repository.enqueue(candidate("same", "letta:source-a"));
    await repository.enqueue(candidate("same", "letta:source-b"));
    await repository.enqueue({ ...candidate("same"), sourceId: undefined });

    await expect(
      repository.listByTurn("turn-1", "letta:source-a"),
    ).resolves.toHaveLength(1);
    await expect(
      repository.listByTurn("turn-1", "letta:source-b"),
    ).resolves.toHaveLength(1);

    await repository.deleteByIds(["same"], "letta:source-a");
    await expect(
      repository.listByTurn("turn-1", "letta:source-a"),
    ).resolves.toEqual([]);
    await expect(
      repository.listByTurn("turn-1", "letta:source-b"),
    ).resolves.toHaveLength(1);
    expect(
      (
        JSON.parse(await readFile(path, "utf8")) as {
          candidates: MemoryCandidate[];
        }
      ).candidates,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "letta:source-b" }),
        expect.not.objectContaining({ sourceId: expect.any(String) }),
      ]),
    );
  });
});
