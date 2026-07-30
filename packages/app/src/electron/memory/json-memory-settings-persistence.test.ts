import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  JsonMemorySettingsPersistence,
  MemorySettingsRepository,
  type SecretCodec,
} from "./settings-repository";

const codec: SecretCodec = {
  encrypt: async () => "ciphertext-only",
  decrypt: async () => "decrypted-secret",
};

describe("JsonMemorySettingsPersistence", () => {
  it("atomically persists encrypted settings and clears the file", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "convera-memory-settings-"),
    );
    const filePath = path.join(directory, "memory-settings.json");
    try {
      const persistence = new JsonMemorySettingsPersistence({
        path: filePath,
      });
      const repository = new MemorySettingsRepository(persistence, codec);
      await repository.update({
        provider: "letta",
        curator: "claude-code",
        apiKey: "plaintext-must-not-persist",
      });

      const text = await readFile(filePath, "utf8");
      expect(text).toContain("ciphertext-only");
      expect(text).not.toContain("plaintext-must-not-persist");
      expect((await stat(filePath)).mode & 0o777).toBe(0o600);

      const reopened = new MemorySettingsRepository(
        new JsonMemorySettingsPersistence({ path: filePath }),
        codec,
      );
      expect(await reopened.get()).toMatchObject({
        provider: "letta",
        baseURL: "http://127.0.0.1:8283",
        curator: "claude-code",
        apiKeyConfigured: true,
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
      const repository = new MemorySettingsRepository(persistence, codec);
      await expect(repository.get()).rejects.toThrow();
      await expect(repository.update({ provider: "letta" })).rejects.toThrow();
      expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(invalid);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
