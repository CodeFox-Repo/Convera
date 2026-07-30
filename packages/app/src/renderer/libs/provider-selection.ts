import {
  DEFAULT_LOCAL_AI_MODEL_ID,
  DEFAULT_LOCAL_AI_PROVIDER_ID,
  isLocalAIProviderId,
} from "./local-ai";

export interface ProviderSelection {
  configId: string;
  modelId: string;
}

export function resolveNativeProviderSelection(
  configId: string | null | undefined,
  modelId: string | null | undefined,
): ProviderSelection {
  if (!configId || !isLocalAIProviderId(configId)) {
    return {
      configId: DEFAULT_LOCAL_AI_PROVIDER_ID,
      modelId: DEFAULT_LOCAL_AI_MODEL_ID,
    };
  }
  return {
    configId,
    modelId: modelId || DEFAULT_LOCAL_AI_MODEL_ID,
  };
}

export function resolveConversationProviderSelection(
  conversation:
    | {
        activeProviderId: string | null;
        activeModelId: string | null;
      }
    | null
    | undefined,
  defaultSelection: ProviderSelection,
): ProviderSelection {
  const normalizedDefault = resolveNativeProviderSelection(
    defaultSelection.configId,
    defaultSelection.modelId,
  );
  if (
    !conversation?.activeProviderId ||
    !isLocalAIProviderId(conversation.activeProviderId)
  ) {
    return normalizedDefault;
  }
  return {
    configId: conversation.activeProviderId,
    modelId: conversation.activeModelId || normalizedDefault.modelId,
  };
}
