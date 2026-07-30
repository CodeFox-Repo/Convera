import { MemoryContextCompiler } from "./context-compiler";
import type { MemoryIndexRepository } from "./index-repository";
import {
  OfficialLettaApiAdapter,
  type LettaApi,
  type OfficialLettaApiConfig,
} from "./letta-api";
import type { MemorySettingsRepository } from "./settings-repository";
import { LettaMemoryStore, type LettaMemoryStoreOptions } from "./store";
import {
  SubconsciousWorker,
  type RestrictedMemoryCurator,
  type SubconsciousWorkerOptions,
} from "./subconscious-worker";

export interface MemoryRuntime {
  store: LettaMemoryStore;
  contextCompiler: MemoryContextCompiler;
  createSubconsciousWorker(
    curator: RestrictedMemoryCurator,
    options: Omit<SubconsciousWorkerOptions, "store" | "curator">,
  ): SubconsciousWorker;
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
