import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonLocalMemoryBackend } from "./local-memory-backend";

describe("JsonLocalMemoryBackend", () => {
  it("persists blocks and passages across main-process restarts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-local-memory-"));
    const path = join(directory, "memory.json");
    const first = new JsonLocalMemoryBackend({ path });
    const block = await first.createBlock({
      label: "profile",
      value: "Favorite color: amber",
      tags: ["scope:user"],
    });
    const archive = await first.createArchive({ name: "conversation-a" });
    const passage = await first.createArchivePassage(archive.id, {
      content: "The release codename is Firefly.",
      tags: ["scope:conversation", "decision"],
      createdAt: "2026-07-31T00:00:00.000Z",
    });

    const recovered = new JsonLocalMemoryBackend({ path });
    expect(await recovered.retrieveBlock(block.id)).toMatchObject({
      value: "Favorite color: amber",
    });
    expect(await recovered.listArchivePassages(archive.id)).toEqual([
      expect.objectContaining({ id: passage.id }),
    ]);
  });

  it("filters local search by scope tags, time, and query relevance", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-local-search-"));
    const backend = new JsonLocalMemoryBackend({
      path: join(directory, "memory.json"),
    });
    const archive = await backend.createArchive({ name: "search" });
    await backend.createArchivePassage(archive.id, {
      content: "The current provider is Codex.",
      tags: ["managed", "scope:a"],
      createdAt: "2026-07-30T00:00:00.000Z",
    });
    await backend.createArchivePassage(archive.id, {
      content: "The old provider was Claude.",
      tags: ["managed", "scope:b"],
      createdAt: "2026-07-20T00:00:00.000Z",
    });

    const hits = await backend.searchArchivePassages(archive.id, {
      query: "current provider",
      tags: ["managed", "scope:a"],
      startDate: "2026-07-29T00:00:00.000Z",
      maxResults: 5,
    });

    expect(hits).toEqual([
      expect.objectContaining({
        content: "The current provider is Codex.",
        score: expect.any(Number),
      }),
    ]);
  });

  it("removes owned records and returns backend-compatible not-found errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-local-delete-"));
    const backend = new JsonLocalMemoryBackend({
      path: join(directory, "memory.json"),
    });
    const block = await backend.createBlock({
      label: "temporary",
      value: "forget me",
    });
    await backend.deleteBlock(block.id);

    await expect(backend.retrieveBlock(block.id)).rejects.toMatchObject({
      status: 404,
      statusCode: 404,
    });
  });

  it("serializes concurrent writes without losing records", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-local-queue-"));
    const path = join(directory, "memory.json");
    const backend = new JsonLocalMemoryBackend({ path });

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        backend.createBlock({
          label: `block-${index}`,
          value: `value-${index}`,
          tags: ["concurrent"],
        }),
      ),
    );

    expect(
      await new JsonLocalMemoryBackend({ path }).listBlocks({
        tags: ["concurrent"],
        matchAllTags: true,
      }),
    ).toHaveLength(20);
  });

  it("cascades archive passage deletion and persists block updates", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-local-crud-"));
    const path = join(directory, "memory.json");
    const backend = new JsonLocalMemoryBackend({ path });
    const block = await backend.createBlock({
      label: "preference",
      value: "old",
    });
    const archive = await backend.createArchive({ name: "owned-archive" });
    await backend.createArchivePassage(archive.id, {
      content: "Delete with the archive.",
    });

    await backend.updateBlock(block.id, { value: "new" });
    await backend.deleteArchive(archive.id);

    const recovered = new JsonLocalMemoryBackend({ path });
    await expect(recovered.retrieveBlock(block.id)).resolves.toMatchObject({
      value: "new",
    });
    await expect(
      recovered.listArchivePassages(archive.id),
    ).rejects.toMatchObject({ status: 404 });
    expect(await recovered.listArchives({ name: "owned-archive" })).toEqual([]);
  });
});
