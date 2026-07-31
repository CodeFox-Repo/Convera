import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  JsonMemorySettingsPersistence,
  MemorySettingsRepository,
} from "./settings-repository";

describe("JsonMemorySettingsPersistence", () => {
  it("atomically persists local settings and clears the file", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "convera-memory-settings-"),
    );
    const filePath = path.join(directory, "memory-settings.json");
    try {
      const persistence = new JsonMemorySettingsPersistence({
        path: filePath,
      });
      const repository = new MemorySettingsRepository(persistence);
      await repository.update({
        provider: "local",
        curator: "claude-code",
      });

      const text = await readFile(filePath, "utf8");
      expect(text).toContain('"provider": "local"');
      expect((await stat(filePath)).mode & 0o777).toBe(0o600);

      const reopened = new MemorySettingsRepository(
        new JsonMemorySettingsPersistence({ path: filePath }),
      );
      expect(await reopened.get()).toMatchObject({
        provider: "local",
        curator: "claude-code",
      });
      await reopened.clear();
      await expect(readFile(filePath, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an unknown schema without overwriting the original file", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "convera-memory-settings-invalid-"),
    );
    const filePath = path.join(directory, "memory-settings.json");
    try {
      const persistence = new JsonMemorySettingsPersistence({
        path: filePath,
      });
      const invalid = { schemaVersion: 999, provider: "cloud" };
      await persistence.write(invalid);
      const repository = new MemorySettingsRepository(persistence);
      await expect(repository.get()).rejects.toThrow();
      await expect(repository.update({ provider: "local" })).rejects.toThrow();
      expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(invalid);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
