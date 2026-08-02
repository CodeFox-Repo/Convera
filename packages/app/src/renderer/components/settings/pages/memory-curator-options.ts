import {
  LOCAL_AI_PROVIDER_NAMES,
  isLocalAIProviderId,
  type LocalAIProviderId,
} from "@/renderer/libs/local-ai";
import type {
  LocalAIMemorySettingsUpdate,
  LocalAISubconsciousProvider,
} from "@/shared/types/local-ai";

export const MEMORY_CURATOR_OPTIONS: Array<{
  value: LocalAISubconsciousProvider;
  label: string;
}> = [
  { value: "off", label: "Off" },
  ...(
    Object.entries(LOCAL_AI_PROVIDER_NAMES) as Array<
      [LocalAIProviderId, string]
    >
  ).map(([value, label]) => ({ value, label })),
  { value: "follow-active", label: "Follow active provider" },
];

export function createMemoryCuratorUpdate(
  value: string,
): LocalAIMemorySettingsUpdate | null {
  if (value === "off" || value === "follow-active") {
    return { subconsciousProvider: value };
  }
  return isLocalAIProviderId(value) ? { subconsciousProvider: value } : null;
}
