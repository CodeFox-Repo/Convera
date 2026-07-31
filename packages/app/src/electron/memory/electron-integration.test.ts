import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemorySessionStateRepository } from "../ai/session/repository";
import {
  createElectronMemoryIntegration,
  forgetMemoryCuratorSessions,
} from "./electron-integration";

describe("Electron memory integration", () => {
  it("persists only local memory settings", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "convera-memory-"));
    const sessions = new InMemorySessionStateRepository();
    await sessions.setConversationMemoryState("conversation-1", {
      memoryVersion: 4,
      memoryEpoch: 2,
    });
    const coordinator = createElectronMemoryIntegration({
      userDataPath,
      workingDirectory: "/workspace",
      sessionRepository: sessions,
    });

    await coordinator.updateMemorySettings({
      provider: "local",
    });
    await coordinator.updateMemorySettings({
      provider: "off",
    });

    const persisted = await readFile(
      join(userDataPath, "local-ai-memory", "settings.json"),
      "utf8",
    );
    expect(persisted).toContain('"schemaVersion": 3');
    expect(persisted).not.toContain("endpoint");
    expect(persisted).not.toContain("credential");
    expect(await coordinator.getMemorySettings()).toMatchObject({
      provider: "off",
    });
    expect(await sessions.getConversation("conversation-1")).toMatchObject({
      revision: 2,
      memoryVersion: 0,
      memoryEpoch: 4,
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
