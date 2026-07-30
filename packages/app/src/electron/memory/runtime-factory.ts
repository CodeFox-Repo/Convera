import { join } from "node:path";
import {
  JsonMemoryCandidateRepository,
  type MemoryCandidateRepository,
} from "./candidate-sink";
import { MemoryContextCompiler } from "./context-compiler";
import {
  JsonMemoryIndexRepository,
  type MemoryIndexRepository,
} from "./index-repository";
import {
  OfficialLettaApiAdapter,
  type LettaApi,
  type OfficialLettaApiConfig,
} from "./letta-api";
import {
  JsonMemorySettingsPersistence,
  MemorySettingsRepository,
  type SecretCodec,
} from "./settings-repository";
import { LettaMemoryStore, type LettaMemoryStoreOptions } from "./store";
import {
  SubconsciousWorker,
  type RestrictedMemoryCurator,
  type SubconsciousWorkerOptions,
} from "./subconscious-worker";
import {
  JsonSubconsciousJobRepository,
  type SubconsciousJobRepository,
} from "./subconscious-job-repository";

export interface MemoryRuntime {
  store: LettaMemoryStore;
  contextCompiler: MemoryContextCompiler;
  createSubconsciousWorker(
    curator: RestrictedMemoryCurator,
    options: Omit<SubconsciousWorkerOptions, "store" | "curator">,
  ): SubconsciousWorker;
}

export interface PersistentMemoryRepositories {
  settings: MemorySettingsRepository;
  indexes: MemoryIndexRepository;
  jobs: SubconsciousJobRepository;
  candidates: MemoryCandidateRepository;
}

export function createPersistentMemoryRepositories(options: {
  directory: string;
  secretCodec: SecretCodec;
}): PersistentMemoryRepositories {
  return {
    settings: new MemorySettingsRepository(
      new JsonMemorySettingsPersistence({
        path: join(options.directory, "settings.json"),
      }),
      options.secretCodec,
    ),
    indexes: new JsonMemoryIndexRepository({
      path: join(options.directory, "indexes.json"),
    }),
    jobs: new JsonSubconsciousJobRepository({
      path: join(options.directory, "subconscious-jobs.json"),
    }),
    candidates: new JsonMemoryCandidateRepository({
      path: join(options.directory, "candidates.json"),
    }),
  };
}

export function createLettaApi(config: OfficialLettaApiConfig): LettaApi {
  return new OfficialLettaApiAdapter(config);
}

export async function createConfiguredLettaApi(
  settings: MemorySettingsRepository,
): Promise<LettaApi> {
  return settings.createLettaApi((config) => createLettaApi(config));
}

export function createMemoryRuntime(options: {
  api: LettaApi;
  indexRepository: MemoryIndexRepository;
  storeOptions?: Omit<LettaMemoryStoreOptions, "api" | "indexRepository">;
}): MemoryRuntime {
  const store = new LettaMemoryStore({
    api: options.api,
    indexRepository: options.indexRepository,
    ...options.storeOptions,
  });
  const contextCompiler = new MemoryContextCompiler();
  return {
    store,
    contextCompiler,
    createSubconsciousWorker: (curator, workerOptions) =>
      new SubconsciousWorker({
        store,
        curator,
        ...workerOptions,
      }),
  };
}
