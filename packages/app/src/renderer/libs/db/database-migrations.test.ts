import { describe, expect, it } from "vitest";
import {
  type ConversationV2MigrationRecord,
  migrateConversationRecordToV2,
  migrateMessageRecordToV2,
} from "./database-migrations";

describe("Dexie v2 migrations", () => {
  it("adds native runtime cursors without changing legacy conversation data", () => {
    const conversation: ConversationV2MigrationRecord & {
      id: string;
      title: string;
      metadata: { starred: boolean };
    } = {
      id: "conversation-1",
      title: "Preserve me",
      modelId: "codex-cli:gpt-5",
      metadata: { starred: true },
    };
    migrateConversationRecordToV2(conversation);
    expect(conversation).toEqual({
      id: "conversation-1",
      title: "Preserve me",
      modelId: "codex-cli:gpt-5",
      metadata: { starred: true },
      activeRevision: 0,
      activeProviderId: "codex-cli",
      activeModelId: "gpt-5",
    });
  });

  it("keeps legacy custom selections exportable but does not route them", () => {
    const conversation: ConversationV2MigrationRecord = {
      modelId: "custom-config:gpt-private",
    };
    migrateConversationRecordToV2(conversation);
    expect(conversation.modelId).toBe("custom-config:gpt-private");
    expect(conversation.activeProviderId).toBeNull();
    expect(conversation.activeModelId).toBeNull();
  });

  it("marks legacy messages complete without overwriting existing v2 state", () => {
    const legacyMessage: { revision?: number; status?: "completed" } = {};
    migrateMessageRecordToV2(legacyMessage);
    expect(legacyMessage).toEqual({ revision: 0, status: "completed" });

    const v2Message = {
      revision: 7,
      status: "failed" as const,
    };
    migrateMessageRecordToV2(v2Message);
    expect(v2Message).toEqual({ revision: 7, status: "failed" });
  });
});
