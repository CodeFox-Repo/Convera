import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemorySessionStateRepository } from "../ai/session/repository";
import { LOCAL_AI_PROVIDER_IDS } from "../ai/types";
import { memoryCuratorConversationId } from "../ai/subscription-memory-curator";
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

  it("forgets every registered provider's curator session for a memory scope", async () => {
    const sessions = new InMemorySessionStateRepository();
    const scope = { kind: "conversation" as const, id: "conversation-1" };
    const curatorIds = LOCAL_AI_PROVIDER_IDS.map((providerId) =>
      memoryCuratorConversationId(scope, providerId),
    );
    await Promise.all(
      curatorIds.map((conversationId, index) =>
        sessions.setConversationMemoryState(conversationId, {
          memoryVersion: index + 1,
          memoryEpoch: index,
        }),
      ),
    );

    await forgetMemoryCuratorSessions(sessions, scope);

    await Promise.all(
      curatorIds.map(async (conversationId) => {
        expect(await sessions.getConversation(conversationId)).toBeUndefined();
      }),
    );
  });
});
