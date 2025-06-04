import { beforeEach, describe, expect, it } from "vitest";
import { getMergedConfig } from "../settings";

const STORAGE_KEY = "foxchat_settings";

function mockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

let localStorageMock: Storage;

beforeEach(() => {
  localStorageMock = mockLocalStorage();
  Object.defineProperty(global, "localStorage", { value: localStorageMock });
});

describe("getMergedConfig", () => {
  it("uses defaults when storage empty", () => {
    const cfg = getMergedConfig();
    expect(cfg.openai.endpoint).toBe("https://openrouter.ai/api/v1");
    expect(cfg.shortcuts.length).toBeGreaterThan(0);
  });

  it("merges user settings", () => {
    const user = { openai: { apiKey: "123" } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    const cfg = getMergedConfig();
    expect(cfg.openai.apiKey).toBe("123");
    // preserve other default values
    expect(cfg.openai.endpoint).toBe("https://openrouter.ai/api/v1");
  });
});
