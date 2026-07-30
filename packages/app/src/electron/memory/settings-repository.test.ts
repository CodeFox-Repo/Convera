import { describe, expect, it, vi } from "vitest";
import {
  InMemoryMemorySettingsPersistence,
  MemorySettingsRepository,
  type SecretCodec,
} from "./settings-repository";

function codec(): SecretCodec {
  return {
    encrypt: vi.fn(async (value) => `encrypted:${value}`),
    decrypt: vi.fn(async (value) => value.replace(/^encrypted:/, "")),
  };
}

describe("MemorySettingsRepository", () => {
  it("persists settings but exposes only apiKeyConfigured", async () => {
    const persistence = new InMemoryMemorySettingsPersistence();
    const secrets = codec();
    const repository = new MemorySettingsRepository(persistence, secrets);

    const updated = await repository.update({
      provider: "letta",
      baseURL: "http://127.0.0.1:8283",
      curator: "claude-code",
      schedule: "batch",
      batchSize: 7,
      idleMs: 9_000,
      apiKey: "top-secret",
    });
    const raw = await persistence.read();

    expect(updated).toEqual({
      provider: "letta",
      baseURL: "http://127.0.0.1:8283",
      curator: "claude-code",
      schedule: "batch",
      batchSize: 7,
      idleMs: 9_000,
      apiKeyConfigured: true,
    });
    expect(JSON.stringify(updated)).not.toContain("top-secret");
    expect(JSON.stringify(raw)).not.toContain('"top-secret"');
  });

  it("decrypts the key only inside the Letta factory and can clear it", async () => {
    const repository = new MemorySettingsRepository(
      new InMemoryMemorySettingsPersistence(),
      codec(),
    );
    await repository.update({ provider: "letta", apiKey: "secret" });
    const factory = vi.fn(() => ({
      health: vi.fn(),
    }));

    await repository.createLettaApi(factory as never);
    expect(factory).toHaveBeenCalledWith({
      baseURL: "http://127.0.0.1:8283",
      apiKey: "secret",
    });

    expect((await repository.update({ apiKey: null })).apiKeyConfigured).toBe(
      false,
    );
    expect(await repository.clear()).toEqual({
      provider: "off",
      baseURL: "http://127.0.0.1:8283",
      curator: "off",
      schedule: "every-turn",
      batchSize: 5,
      idleMs: 5_000,
      apiKeyConfigured: false,
    });
  });

  it("keeps batch scheduling aligned with the IPC minimum", async () => {
    const repository = new MemorySettingsRepository(
      new InMemoryMemorySettingsPersistence(),
      codec(),
    );

    await expect(repository.update({ batchSize: 1 })).rejects.toThrow();
    await expect(repository.update({ batchSize: 2 })).resolves.toMatchObject({
      batchSize: 2,
    });
  });
});
