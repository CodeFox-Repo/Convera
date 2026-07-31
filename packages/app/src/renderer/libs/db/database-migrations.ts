import { isLocalAIProviderId } from "../local-ai";

export interface ConversationV2MigrationRecord {
  modelId: string | null;
  activeRevision?: number;
  activeProviderId?: string | null;
  activeModelId?: string | null;
}

export interface MessageV2MigrationRecord {
  revision?: number;
  status?: "pending" | "streaming" | "completed" | "failed" | "aborted";
}

export function migrateConversationRecordToV2(
  conversation: ConversationV2MigrationRecord,
): void {
  const legacySelection = conversation.modelId ?? "";
  const separatorIndex = legacySelection.indexOf(":");
  const legacyProviderId =
    separatorIndex >= 0
      ? legacySelection.slice(0, separatorIndex)
      : legacySelection;
  const legacyModelId =
    separatorIndex >= 0 ? legacySelection.slice(separatorIndex + 1) : "";

  conversation.activeRevision ??= 0;
  conversation.activeProviderId =
    legacyProviderId && isLocalAIProviderId(legacyProviderId)
      ? legacyProviderId
      : null;
  conversation.activeModelId =
    conversation.activeProviderId && legacyModelId ? legacyModelId : null;
}

export function migrateMessageRecordToV2(
  message: MessageV2MigrationRecord,
): void {
  message.revision ??= 0;
  message.status ??= "completed";
}
