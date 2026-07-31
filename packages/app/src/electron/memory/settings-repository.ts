import { z } from "zod";
import { AtomicJsonFile } from "./json-file";
import { SerialTaskQueue } from "./serial-queue";

export const MEMORY_PROVIDERS = ["off", "local"] as const;
export const MEMORY_CURATORS = [
  "off",
  "codex-cli",
  "claude-code",
  "follow-active",
] as const;
export const MEMORY_SCHEDULES = ["every-turn", "batch", "idle"] as const;

export type MemoryProvider = (typeof MEMORY_PROVIDERS)[number];
export type MemoryCurator = (typeof MEMORY_CURATORS)[number];
export type MemoryScheduleSetting = (typeof MEMORY_SCHEDULES)[number];

export interface PublicMemorySettings {
  provider: MemoryProvider;
  curator: MemoryCurator;
  schedule: MemoryScheduleSetting;
  batchSize: number;
  idleMs: number;
}

export interface UpdateMemorySettings {
  provider?: MemoryProvider;
  curator?: MemoryCurator;
  schedule?: MemoryScheduleSetting;
  batchSize?: number;
  idleMs?: number;
}

interface PersistedMemorySettings {
  schemaVersion: 3;
  provider: MemoryProvider;
  curator: MemoryCurator;
  schedule: MemoryScheduleSetting;
  batchSize: number;
  idleMs: number;
}

export interface MemorySettingsPersistence {
  read(): Promise<unknown | undefined>;
  write(value: unknown): Promise<void>;
  clear(): Promise<void>;
}

const persistedSchema = z.object({
  schemaVersion: z.literal(3),
  provider: z.enum(MEMORY_PROVIDERS),
  curator: z.enum(MEMORY_CURATORS),
  schedule: z.enum(MEMORY_SCHEDULES),
  batchSize: z.number().int().min(1).max(100),
  idleMs: z.number().int().min(0).max(86_400_000),
});

const legacySchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    provider: z.string(),
    curator: z.enum(MEMORY_CURATORS),
    schedule: z.enum(MEMORY_SCHEDULES),
    batchSize: z.number().int().min(1).max(100),
    idleMs: z.number().int().min(0).max(86_400_000),
  })
  .passthrough();

const updateSchema = z.object({
  provider: z.enum(MEMORY_PROVIDERS).optional(),
  curator: z.enum(MEMORY_CURATORS).optional(),
  schedule: z.enum(MEMORY_SCHEDULES).optional(),
  batchSize: z.number().int().min(2).max(100).optional(),
  idleMs: z.number().int().min(0).max(86_400_000).optional(),
});

export const DEFAULT_MEMORY_SETTINGS: PublicMemorySettings = {
  provider: "off",
  curator: "off",
  schedule: "every-turn",
  batchSize: 5,
  idleMs: 5_000,
};

function defaults(): PersistedMemorySettings {
  return {
    schemaVersion: 3,
    ...DEFAULT_MEMORY_SETTINGS,
  };
}

function publicView(value: PersistedMemorySettings): PublicMemorySettings {
  return {
    provider: value.provider,
    curator: value.curator,
    schedule: value.schedule,
    batchSize: value.batchSize,
    idleMs: value.idleMs,
  };
}

export class MemorySettingsRepository {
  private readonly writes = new SerialTaskQueue();

  constructor(private readonly persistence: MemorySettingsPersistence) {}

  async get(): Promise<PublicMemorySettings> {
    return publicView(await this.readPersisted());
  }

  async update(patch: UpdateMemorySettings): Promise<PublicMemorySettings> {
    const validated = updateSchema.parse(patch);
    return this.writes.run(async () => {
      const current = await this.readPersisted();
      const defined = Object.fromEntries(
        Object.entries(validated).filter(([, value]) => value !== undefined),
      );
      const next = persistedSchema.parse({
        ...current,
        ...defined,
      });
      await this.persistence.write(next);
      return publicView(next);
    });
  }

  async clear(): Promise<PublicMemorySettings> {
    return this.writes.run(async () => {
      await this.persistence.clear();
      return publicView(defaults());
    });
  }

  getSourceId(): string {
    return "local:v1";
  }

  private async readPersisted(): Promise<PersistedMemorySettings> {
    const value = await this.persistence.read();
    if (value === undefined) return defaults();
    const current = persistedSchema.safeParse(value);
    if (current.success) return current.data;
    const legacy = legacySchema.parse(value);
    const migrated: PersistedMemorySettings = {
      schemaVersion: 3,
      provider: legacy.provider === "local" ? "local" : "off",
      curator: legacy.curator,
      schedule: legacy.schedule,
      batchSize: legacy.batchSize,
      idleMs: legacy.idleMs,
    };
    await this.persistence.write(migrated);
    return migrated;
  }
}

export class InMemoryMemorySettingsPersistence
  implements MemorySettingsPersistence
{
  private value: unknown;

  constructor(initial?: unknown) {
    this.value = initial === undefined ? undefined : structuredClone(initial);
  }

  async read(): Promise<unknown | undefined> {
    return this.value === undefined ? undefined : structuredClone(this.value);
  }

  async write(value: unknown): Promise<void> {
    this.value = structuredClone(value);
  }

  async clear(): Promise<void> {
    this.value = undefined;
  }
}

export class JsonMemorySettingsPersistence
  implements MemorySettingsPersistence
{
  private readonly file: AtomicJsonFile;

  constructor(options: { path: string }) {
    this.file = new AtomicJsonFile(options.path);
  }

  read(): Promise<unknown | undefined> {
    return this.file.read();
  }

  write(value: unknown): Promise<void> {
    return this.file.write(value);
  }

  clear(): Promise<void> {
    return this.file.clear();
  }
}
