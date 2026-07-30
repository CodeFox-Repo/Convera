import type {
  LocalAIChatOperation,
  LocalAIConversationRuntimeState,
  LocalAIMessage,
} from "@/shared/types/local-ai";
import type { Message } from "@/renderer/types/chat";

export type RendererChatOperation =
  | { kind: "append" }
  | { kind: "bootstrap" }
  | {
      kind: "rebase";
      reason: "edit" | "regenerate" | "provider-switch";
      sourceMessageId?: string;
    };

export const BOOTSTRAP_MESSAGE_LIMIT = 100;
export const BOOTSTRAP_CHARACTER_LIMIT = 200_000;
export const BOOTSTRAP_TRUNCATION_MARKER =
  "[Convera checkpoint] Earlier visible messages were omitted to fit the deterministic bootstrap budget. Provider-neutral memory and checkpoints are injected separately.";

export function toLocalAIRequestMessages(
  messages: Message[],
): LocalAIMessage[] {
  return messages
    .filter(
      (
        message,
      ): message is Message & {
        role: "system" | "user" | "assistant";
      } =>
        message.role === "system" ||
        message.role === "user" ||
        message.role === "assistant",
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      content:
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content),
    }));
}

export function buildLocalAIChatOperation(
  messages: Message[],
  requestedOperation: RendererChatOperation,
): LocalAIChatOperation {
  const requestMessages = toLocalAIRequestMessages(messages);
  if (requestedOperation.kind === "append") {
    const message = requestMessages.at(-1);
    if (!message || message.role !== "user") {
      throw new Error("An append operation requires a latest user message.");
    }
    return {
      kind: "append",
      message,
      recoveryMessages: boundBootstrapMessages(requestMessages),
    };
  }
  if (requestedOperation.kind === "bootstrap") {
    return {
      kind: "bootstrap",
      messages: boundBootstrapMessages(requestMessages),
    };
  }
  return {
    kind: "rebase",
    reason: requestedOperation.reason,
    sourceMessageId: requestedOperation.sourceMessageId,
    messages: boundBootstrapMessages(requestMessages),
  };
}

export function boundBootstrapMessages(
  messages: LocalAIMessage[],
): LocalAIMessage[] {
  const totalCharacters = messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );
  if (
    messages.length <= BOOTSTRAP_MESSAGE_LIMIT &&
    totalCharacters <= BOOTSTRAP_CHARACTER_LIMIT
  ) {
    return messages;
  }

  const marker: LocalAIMessage = {
    role: "system",
    content: BOOTSTRAP_TRUNCATION_MARKER,
  };
  const latestMessage = messages.at(-1);
  if (
    latestMessage &&
    latestMessage.content.length + marker.content.length >
      BOOTSTRAP_CHARACTER_LIMIT
  ) {
    // The accepted user action is never truncated. If it consumes the entire
    // bootstrap budget, omit the explanatory marker and all older context.
    return [latestMessage];
  }
  let remainingMessages = BOOTSTRAP_MESSAGE_LIMIT - 1;
  let remainingCharacters = BOOTSTRAP_CHARACTER_LIMIT - marker.content.length;
  const systems: LocalAIMessage[] = [];
  const recent: LocalAIMessage[] = [];

  for (const systemMessage of messages.filter(
    (message) => message.role === "system",
  )) {
    if (
      remainingMessages <= 1 ||
      systemMessage.content.length > remainingCharacters
    ) {
      break;
    }
    systems.push(systemMessage);
    remainingMessages -= 1;
    remainingCharacters -= systemMessage.content.length;
  }

  const nonSystemMessages = messages.filter(
    (message) => message.role !== "system",
  );
  for (let index = nonSystemMessages.length - 1; index >= 0; index -= 1) {
    if (remainingMessages === 0 || remainingCharacters === 0) break;
    const message = nonSystemMessages[index];
    if (message.content.length > remainingCharacters) {
      if (recent.length === 0) {
        recent.unshift({
          ...message,
          content: message.content.slice(0, remainingCharacters),
        });
      }
      break;
    }
    recent.unshift(message);
    remainingMessages -= 1;
    remainingCharacters -= message.content.length;
  }

  return [marker, ...systems, ...recent];
}

export function selectAppendOperation(
  runtimeState: LocalAIConversationRuntimeState | null,
  providerId: string,
  priorVisibleMessageCount: number,
): Extract<RendererChatOperation, { kind: "append" | "bootstrap" | "rebase" }> {
  const revisionBinding = runtimeState?.providers.find(
    (provider) =>
      provider.providerId === providerId &&
      provider.revision === runtimeState.revision,
  );
  const currentBinding =
    revisionBinding?.stale === false ? revisionBinding : undefined;
  const sharedTranscriptMovedToAnotherProvider =
    runtimeState?.lastCompletedProviderId !== undefined &&
    runtimeState.lastCompletedProviderId !== providerId;
  const bindingMissesSharedTranscript =
    revisionBinding !== undefined &&
    runtimeState !== null &&
    revisionBinding.transcriptVersion !== runtimeState.transcriptVersion;
  if (sharedTranscriptMovedToAnotherProvider || bindingMissesSharedTranscript) {
    return { kind: "rebase", reason: "provider-switch" };
  }

  const hasCurrentBinding = currentBinding !== undefined;
  return !hasCurrentBinding && priorVisibleMessageCount > 0
    ? { kind: "bootstrap" }
    : { kind: "append" };
}
