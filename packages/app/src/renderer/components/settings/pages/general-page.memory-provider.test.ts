// The page now imports the profile section, which reaches the Dexie singleton.
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/renderer/libs/hooks/use-local-ai-providers", () => ({
  useLocalAIProviders: vi.fn(),
}));
vi.mock("@/renderer/libs/stores/model-config-store", () => ({
  useModelConfigStore: vi.fn(),
}));
vi.mock("@/renderer/libs/stores/settings-store", () => ({
  useSettingsStore: vi.fn(),
}));

import {
  MEMORY_PROVIDER_OPTIONS,
  createMemoryProviderUpdate,
} from "./general-page";

describe("GeneralSettingsPage memory provider contract", () => {
  it("offers Off and Local in the shared contract order", () => {
    expect(MEMORY_PROVIDER_OPTIONS).toEqual([
      { value: "off", label: "Off" },
      { value: "local", label: "Local" },
    ]);
  });

  it("creates updates only for supported providers", () => {
    expect(createMemoryProviderUpdate("off")).toEqual({ provider: "off" });
    expect(createMemoryProviderUpdate("local")).toEqual({ provider: "local" });
    expect(createMemoryProviderUpdate("letta")).toBeNull();
    expect(createMemoryProviderUpdate("remote")).toBeNull();
  });
});
