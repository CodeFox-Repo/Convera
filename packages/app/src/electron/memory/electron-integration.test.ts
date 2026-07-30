import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemorySessionStateRepository } from "../ai/session/repository";
import {
  createElectronMemoryIntegration,
  forgetMemoryCuratorSessions,
  SafeStorageSecretCodec,
  type SafeStorageBackend,
} from "./electron-integration";

function fakeSafeStorage(): SafeStorageBackend {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext) =>
      Buffer.from(`ciphertext:${plaintext}`, "utf8"),
    decryptString: (ciphertext) =>
      ciphertext.toString("utf8").replace(/^ciphertext:/, ""),
  };
}

describe("Electron memory integration", () => {
  it("uses OS-backed secret encoding and never persists a plaintext API key", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "convera-memory-"));
    const sessions = new InMemorySessionStateRepository();
    await sessions.setConversationMemoryState("conversation-1", {
      memoryVersion: 4,
      memoryEpoch: 2,
    });
    const coordinator = createElectronMemoryIntegration({
      userDataPath,
      workingDirectory: "/workspace",
      safeStorage: fakeSafeStorage(),
      sessionRepository: sessions,
    });

    await coordinator.updateMemorySettings({
      provider: "letta",
      apiKey: "secret-value",
    });

    const persisted = await readFile(
      join(userDataPath, "local-ai-memory", "settings.json"),
      "utf8",
    );
    expect(persisted).not.toContain("secret-value");
    expect(await coordinator.getMemorySettings()).toMatchObject({
      provider: "letta",
      apiKeyConfigured: true,
    });
    expect(await sessions.getConversation("conversation-1")).toMatchObject({
      revision: 1,
      memoryVersion: 0,
      memoryEpoch: 3,
    });
  });

  it("refuses secret persistence when platform encryption is unavailable", async () => {
    const codec = new SafeStorageSecretCodec({
      ...fakeSafeStorage(),
      isEncryptionAvailable: () => false,
    });

    await expect(codec.encrypt("secret")).rejects.toMatchObject({
      code: "CONFIGURATION",
    });
  });

  it("forgets both provider-native curator sessions for a memory scope", async () => {
    const sessions = new InMemorySessionStateRepository();
    const scope = { kind: "conversation" as const, id: "conversation-1" };
    const codexId = "memory-curator:conversation:conversation-1:codex-cli";
    const claudeId = "memory-curator:conversation:conversation-1:claude-code";
    await sessions.setConversationMemoryState(codexId, {
      memoryVersion: 3,
      memoryEpoch: 1,
    });
    await sessions.setConversationMemoryState(claudeId, {
      memoryVersion: 4,
      memoryEpoch: 2,
    });

    await forgetMemoryCuratorSessions(sessions, scope);

    expect(await sessions.getConversation(codexId)).toBeUndefined();
    expect(await sessions.getConversation(claudeId)).toBeUndefined();
  });
});
