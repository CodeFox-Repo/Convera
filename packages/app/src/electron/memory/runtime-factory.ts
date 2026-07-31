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
import { JsonLocalMemoryBackend } from "./local-memory-backend";
import type { MemoryBackend } from "./memory-backend";
import {
  JsonMemorySettingsPersistence,
  MemorySettingsRepository,
} from "./settings-repository";
import { LocalMemoryStore, type LocalMemoryStoreOptions } from "./store";
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
  store: LocalMemoryStore;
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
}): PersistentMemoryRepositories {
  return {
    settings: new MemorySettingsRepository(
      new JsonMemorySettingsPersistence({
        path: join(options.directory, "settings.json"),
      }),
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

export function createLocalMemoryBackend(path: string): MemoryBackend {
  return new JsonLocalMemoryBackend({ path });
}

export function createMemoryRuntime(options: {
  backend: MemoryBackend;
  indexRepository: MemoryIndexRepository;
  storeOptions?: Omit<LocalMemoryStoreOptions, "backend" | "indexRepository">;
}): MemoryRuntime {
  const store = new LocalMemoryStore({
    backend: options.backend,
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
