import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEmptyMemoryScopeIndex,
  JsonMemoryIndexRepository,
} from "./index-repository";

const temporaryDirectories: string[] = [];

async function temporaryFile(): Promise<string> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "convera-memory-index-"),
  );
  temporaryDirectories.push(directory);
  return path.join(directory, "index.json");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("JsonMemoryIndexRepository", () => {
  it("atomically persists mappings, versions, cache, and pending writes", async () => {
    const filePath = await temporaryFile();
    const scope = { kind: "conversation" as const, id: "conversation-1" };
    const index = createEmptyMemoryScopeIndex(scope);
    index.sourceId = "letta:source-fingerprint";
    index.nextJournalSequence = 5;
    index.archiveId = "archive-1";
    index.blockIds.current_goal = "block-1";
    index.version = 3;
    index.pendingWrites.push({
      patch: {
        scope,
        baseVersion: 3,
        turnId: "turn-4",
        provenance: {
          actor: "subconscious",
          turnId: "turn-4",
          timestamp: "2026-07-31T00:00:00.000Z",
        },
        operations: [
          {
            type: "upsert_block",
            label: "current_goal",
            value: "finish memory",
          },
        ],
      },
      journalSequence: 4,
      attempts: 1,
      queuedAt: "2026-07-31T00:00:00.000Z",
      lastError: "offline",
    });

    await new JsonMemoryIndexRepository({ path: filePath }).put(index);
    const recovered = await new JsonMemoryIndexRepository({
      path: filePath,
    }).get(scope);
    const files = await readdir(path.dirname(filePath));

    expect(recovered).toMatchObject({
      archiveId: "archive-1",
      sourceId: "letta:source-fingerprint",
      nextJournalSequence: 5,
      version: 3,
      blockIds: { current_goal: "block-1" },
    });
    expect(recovered?.pendingWrites[0]?.patch.turnId).toBe("turn-4");
    expect(recovered?.pendingWrites[0]?.journalSequence).toBe(4);
    expect(files).toEqual(["index.json"]);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toMatchObject({
      schemaVersion: 1,
    });
  });

  it("rejects an unknown schema version at startup", async () => {
    const filePath = await temporaryFile();
    const invalid = { schemaVersion: 99, indexes: [] };
    await writeFile(filePath, JSON.stringify(invalid), "utf8");

    const repository = new JsonMemoryIndexRepository({ path: filePath });
    await expect(repository.list()).rejects.toThrow();
    await expect(
      repository.put(
        createEmptyMemoryScopeIndex({
          kind: "conversation",
          id: "must-not-overwrite",
        }),
      ),
    ).rejects.toThrow();
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(invalid);
  });
});
