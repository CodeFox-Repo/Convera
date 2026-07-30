import { z } from "zod";
import { MemoryError } from "./errors";
import { AtomicJsonFile } from "./json-file";
import { SerialTaskQueue } from "./serial-queue";
import type { LettaApi, OfficialLettaApiConfig } from "./letta-api";

export const MEMORY_PROVIDERS = ["off", "letta"] as const;
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
  baseURL: string;
  curator: MemoryCurator;
  schedule: MemoryScheduleSetting;
  batchSize: number;
  idleMs: number;
  apiKeyConfigured: boolean;
}

export interface UpdateMemorySettings {
  provider?: MemoryProvider;
  baseURL?: string | null;
  curator?: MemoryCurator;
  schedule?: MemoryScheduleSetting;
  batchSize?: number;
  idleMs?: number;
  apiKey?: string | null;
}

interface PersistedMemorySettings {
  schemaVersion: 1;
  provider: MemoryProvider;
  baseURL: string;
  curator: MemoryCurator;
  schedule: MemoryScheduleSetting;
  batchSize: number;
  idleMs: number;
  encryptedApiKey?: string;
}

export interface MemorySettingsPersistence {
  read(): Promise<unknown | undefined>;
  write(value: unknown): Promise<void>;
  clear(): Promise<void>;
}

export interface SecretCodec {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

export type LettaApiFactory = (config: OfficialLettaApiConfig) => LettaApi;

const persistedSchema = z.object({
  schemaVersion: z.literal(1),
  provider: z.enum(MEMORY_PROVIDERS),
  baseURL: z.string().url(),
  curator: z.enum(MEMORY_CURATORS),
  schedule: z.enum(MEMORY_SCHEDULES),
  batchSize: z.number().int().min(1).max(100),
  idleMs: z.number().int().min(0).max(86_400_000),
  encryptedApiKey: z.string().min(1).optional(),
});

const updateSchema = z.object({
  provider: z.enum(MEMORY_PROVIDERS).optional(),
  baseURL: z.string().url().nullable().optional(),
  curator: z.enum(MEMORY_CURATORS).optional(),
  schedule: z.enum(MEMORY_SCHEDULES).optional(),
  batchSize: z.number().int().min(2).max(100).optional(),
  idleMs: z.number().int().min(0).max(86_400_000).optional(),
  apiKey: z.string().trim().min(1).max(20_000).nullable().optional(),
});

export const DEFAULT_MEMORY_SETTINGS: PublicMemorySettings = {
  provider: "off",
  baseURL: "http://127.0.0.1:8283",
  curator: "off",
  schedule: "every-turn",
  batchSize: 5,
  idleMs: 5_000,
  apiKeyConfigured: false,
};

function defaults(): PersistedMemorySettings {
  return {
    schemaVersion: 1,
    provider: DEFAULT_MEMORY_SETTINGS.provider,
    baseURL: DEFAULT_MEMORY_SETTINGS.baseURL,
    curator: DEFAULT_MEMORY_SETTINGS.curator,
    schedule: DEFAULT_MEMORY_SETTINGS.schedule,
    batchSize: DEFAULT_MEMORY_SETTINGS.batchSize,
    idleMs: DEFAULT_MEMORY_SETTINGS.idleMs,
  };
}

function publicView(value: PersistedMemorySettings): PublicMemorySettings {
  return {
    provider: value.provider,
    baseURL: value.baseURL,
    curator: value.curator,
    schedule: value.schedule,
    batchSize: value.batchSize,
    idleMs: value.idleMs,
    apiKeyConfigured: Boolean(value.encryptedApiKey),
  };
}

export class MemorySettingsRepository {
  private readonly writes = new SerialTaskQueue();

  constructor(
    private readonly persistence: MemorySettingsPersistence,
    private readonly secrets: SecretCodec,
  ) {}

  async get(): Promise<PublicMemorySettings> {
    return publicView(await this.readPersisted());
  }

  async update(patch: UpdateMemorySettings): Promise<PublicMemorySettings> {
    const validated = updateSchema.parse(patch);
    return this.writes.run(async () => {
      const current = await this.readPersisted();
      const next: PersistedMemorySettings = {
        ...current,
        provider: validated.provider ?? current.provider,
        curator: validated.curator ?? current.curator,
        schedule: validated.schedule ?? current.schedule,
        batchSize: validated.batchSize ?? current.batchSize,
        idleMs: validated.idleMs ?? current.idleMs,
      };
      if (validated.baseURL === null)
        next.baseURL = DEFAULT_MEMORY_SETTINGS.baseURL;
      else if (validated.baseURL !== undefined)
        next.baseURL = validated.baseURL;

      if (validated.apiKey === null) delete next.encryptedApiKey;
      else if (validated.apiKey !== undefined) {
        next.encryptedApiKey = await this.secrets.encrypt(validated.apiKey);
      }
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

  /**
   * Decrypts the key only inside the provided factory and never includes it in
   * the settings value returned to callers.
   */
  async createLettaApi(factory: LettaApiFactory): Promise<LettaApi> {
    const persisted = await this.readPersisted();
    if (persisted.provider !== "letta") {
      throw new MemoryError(
        "Letta memory is disabled. Select the Letta provider before creating a client.",
        "CONFIGURATION",
        false,
      );
    }
    const apiKey = persisted.encryptedApiKey
      ? await this.secrets.decrypt(persisted.encryptedApiKey)
      : undefined;
    return factory({
      baseURL: persisted.baseURL,
      apiKey,
    });
  }

  private async readPersisted(): Promise<PersistedMemorySettings> {
    const value = await this.persistence.read();
    if (value === undefined) return defaults();
    return persistedSchema.parse(value);
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
