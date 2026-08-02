import { describe, expect, it } from "vitest";
import {
  InMemoryMemorySettingsPersistence,
  MemorySettingsRepository,
} from "./settings-repository";

describe("MemorySettingsRepository", () => {
  it("defaults to paused memory and persists scheduling settings", async () => {
    const persistence = new InMemoryMemorySettingsPersistence();
    const repository = new MemorySettingsRepository(persistence);

    expect(await repository.get()).toEqual({
      provider: "off",
      curator: "off",
      schedule: "every-turn",
      batchSize: 5,
      idleMs: 5_000,
    });
    await expect(
      repository.update({
        provider: "off",
        curator: "claude-code",
        schedule: "batch",
        batchSize: 7,
        idleMs: 9_000,
      }),
    ).resolves.toEqual({
      provider: "off",
      curator: "claude-code",
      schedule: "batch",
      batchSize: 7,
      idleMs: 9_000,
    });
    expect(await persistence.read()).toEqual({
      schemaVersion: 3,
      provider: "off",
      curator: "claude-code",
      schedule: "batch",
      batchSize: 7,
      idleMs: 9_000,
    });
  });

  it("keeps one stable local source while memory is paused", async () => {
    const repository = new MemorySettingsRepository(
      new InMemoryMemorySettingsPersistence(),
    );

    const sourceId = repository.getSourceId();
    await repository.update({ provider: "off" });

    expect(sourceId).toBe("local:v1");
    expect(repository.getSourceId()).toBe(sourceId);
    await repository.update({ provider: "local" });
    expect(repository.getSourceId()).toBe(sourceId);
  });

  it.each(["openai-api", "fireworks-api"] as const)(
    "persists the registered %s provider as a curator",
    async (curator) => {
      const persistence = new InMemoryMemorySettingsPersistence();
      const repository = new MemorySettingsRepository(persistence);

      await expect(repository.update({ curator })).resolves.toMatchObject({
        curator,
      });
      await expect(persistence.read()).resolves.toMatchObject({ curator });
    },
  );

  it("ignores omitted IPC fields represented as explicit undefined", async () => {
    const repository = new MemorySettingsRepository(
      new InMemoryMemorySettingsPersistence(),
    );

    await expect(
      repository.update({
        provider: "off",
        curator: undefined,
        schedule: undefined,
        batchSize: undefined,
        idleMs: undefined,
      }),
    ).resolves.toEqual({
      provider: "off",
      curator: "off",
      schedule: "every-turn",
      batchSize: 5,
      idleMs: 5_000,
    });
  });

  it("migrates old settings without retaining removed connection fields", async () => {
    const persistence = new InMemoryMemorySettingsPersistence({
      schemaVersion: 2,
      provider: "local",
      curator: "codex-cli",
      schedule: "idle",
      batchSize: 6,
      idleMs: 8_000,
      endpoint: "https://removed.invalid",
      credential: "removed-secret",
    });
    const repository = new MemorySettingsRepository(persistence);

    expect(await repository.get()).toEqual({
      provider: "local",
      curator: "codex-cli",
      schedule: "idle",
      batchSize: 6,
      idleMs: 8_000,
    });
    expect(await persistence.read()).toEqual({
      schemaVersion: 3,
      provider: "local",
      curator: "codex-cli",
      schedule: "idle",
      batchSize: 6,
      idleMs: 8_000,
    });
  });

  it("migrates an unsupported old provider to paused local memory", async () => {
    const persistence = new InMemoryMemorySettingsPersistence({
      schemaVersion: 1,
      provider: "removed-provider",
      curator: "off",
      schedule: "every-turn",
      batchSize: 5,
      idleMs: 5_000,
    });
    const repository = new MemorySettingsRepository(persistence);

    expect(await repository.get()).toMatchObject({ provider: "off" });
    expect(await persistence.read()).toMatchObject({
      schemaVersion: 3,
      provider: "off",
    });
  });

  it("keeps batch scheduling aligned with the IPC minimum", async () => {
    const repository = new MemorySettingsRepository(
      new InMemoryMemorySettingsPersistence(),
    );

    await expect(repository.update({ batchSize: 1 })).rejects.toThrow();
    await expect(repository.update({ batchSize: 2 })).resolves.toMatchObject({
      batchSize: 2,
    });
  });
});
