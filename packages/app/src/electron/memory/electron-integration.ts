import { RestrictedMemoryCurator } from "../ai/subscription-memory-curator";
import type { SessionStateRepository } from "../ai/session/types";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { MemoryIntegrationCoordinator } from "./coordinator";
import { MemoryError } from "./errors";
import { createPersistentMemoryRepositories } from "./runtime-factory";
import type { SecretCodec } from "./settings-repository";

export interface SafeStorageBackend {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(ciphertext: Buffer): string;
}

export class SafeStorageSecretCodec implements SecretCodec {
  constructor(private readonly backend: SafeStorageBackend) {}

  async encrypt(plaintext: string): Promise<string> {
    if (!this.backend.isEncryptionAvailable()) {
      throw new MemoryError(
        "Operating-system credential encryption is unavailable. The Letta API key was not saved.",
        "CONFIGURATION",
        false,
      );
    }
    return this.backend.encryptString(plaintext).toString("base64");
  }

  async decrypt(ciphertext: string): Promise<string> {
    if (!this.backend.isEncryptionAvailable()) {
      throw new MemoryError(
        "Operating-system credential encryption is unavailable. The Letta API key cannot be read.",
        "CONFIGURATION",
        false,
      );
    }
    return this.backend.decryptString(Buffer.from(ciphertext, "base64"));
  }
}

export interface ElectronMemoryIntegrationOptions {
  userDataPath: string;
  workingDirectory: string;
  safeStorage: SafeStorageBackend;
  sessionRepository: SessionStateRepository;
}

function stableScopeId(namespace: string, value: string): string {
  const digest = createHash("sha256")
    .update(`${namespace}\0${value}`)
    .digest("hex")
    .slice(0, 24);
  return `${namespace}-${digest}`;
}

/**
 * Builds the production memory graph without contacting Letta. The official
 * client and subscription curator are both lazy and remain dormant while the
 * persisted provider settings are off.
 */
export function createElectronMemoryIntegration(
  options: ElectronMemoryIntegrationOptions,
): MemoryIntegrationCoordinator {
  const dataDirectory = join(options.userDataPath, "local-ai-memory");
  const repositories = createPersistentMemoryRepositories({
    directory: dataDirectory,
    secretCodec: new SafeStorageSecretCodec(options.safeStorage),
  });
  const coordinator = new MemoryIntegrationCoordinator({
    settingsRepository: repositories.settings,
    indexRepository: repositories.indexes,
    candidateRepository: repositories.candidates,
    jobRepository: repositories.jobs,
    curatorFactory: {
      create: (provider) =>
        new RestrictedMemoryCurator({
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
  });
  return coordinator;
}
