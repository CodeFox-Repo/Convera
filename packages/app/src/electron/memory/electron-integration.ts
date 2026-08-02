import {
  memoryCuratorConversationId,
  RestrictedMemoryCurator,
} from "../ai/subscription-memory-curator";
import type { SessionStateRepository } from "../ai/session/types";
import { LOCAL_AI_PROVIDER_IDS } from "../ai/types";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { MemoryIntegrationCoordinator } from "./coordinator";
import {
  createLocalMemoryBackend,
  createPersistentMemoryRepositories,
} from "./runtime-factory";

export interface ElectronMemoryIntegrationOptions {
  userDataPath: string;
  workingDirectory: string;
  sessionRepository: SessionStateRepository;
}

function stableScopeId(namespace: string, value: string): string {
  const digest = createHash("sha256")
    .update(`${namespace}\0${value}`)
    .digest("hex")
    .slice(0, 24);
  return `${namespace}-${digest}`;
}

export async function forgetMemoryCuratorSessions(
  repository: SessionStateRepository,
  scope: Parameters<typeof memoryCuratorConversationId>[0],
): Promise<void> {
  await Promise.all(
    LOCAL_AI_PROVIDER_IDS.map((providerId) =>
      repository.deleteConversation(
        memoryCuratorConversationId(scope, providerId),
      ),
    ),
  );
}

export function createElectronMemoryIntegration(
  options: ElectronMemoryIntegrationOptions,
): MemoryIntegrationCoordinator {
  const dataDirectory = join(options.userDataPath, "local-ai-memory");
  const repositories = createPersistentMemoryRepositories({
    directory: dataDirectory,
  });
  const coordinator = new MemoryIntegrationCoordinator({
    settingsRepository: repositories.settings,
    indexRepository: repositories.indexes,
    candidateRepository: repositories.candidates,
    jobRepository: repositories.jobs,
    backendFactory: () =>
      Promise.resolve(
        createLocalMemoryBackend(join(dataDirectory, "local-provider.json")),
      ),
    curatorFactory: {
      create: (provider) =>
        new RestrictedMemoryCurator({
          // Curators are isolated text-only sessions. Provider adapters own
          // authentication, model selection, and native session semantics.
          provider,
          sessionRepository: options.sessionRepository,
          workingDirectory: options.workingDirectory,
        }),
    },
    userScopeId: stableScopeId("user", resolve(options.userDataPath)),
    resolveWorkspaceScopeId: (input) =>
      stableScopeId(
        "workspace",
        resolve(input.workingDirectory || options.workingDirectory),
      ),
    onConversationMemoryObserved: async (conversationId, state) => {
      await options.sessionRepository.setConversationMemoryState(
        conversationId,
        state,
      );
    },
    onMemoryContextChanged: async () => {
      await options.sessionRepository.rotateAllForMemoryContextChange();
    },
    onMemoryScopeForgotten: async (scope) => {
      await forgetMemoryCuratorSessions(options.sessionRepository, scope);
    },
  });
  return coordinator;
}
