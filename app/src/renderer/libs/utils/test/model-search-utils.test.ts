import { describe, expect, it, vi } from "vitest";
import {
  fallbackSearch,
  loadFuzzyInstance,
  searchModels,
} from "../model-search-utils";

const MODELS = [
  "gpt-3.5-turbo",
  "gpt-4",
  "gpt-4-32k",
  "gpt3.5",
  "llama-2",
  "mistral-7b",
  "gpt-neo",
  "gpt-3.5.2",
  "gpt4all",
];

describe("fuzzySearchUtils", () => {
  it("fallbackSearch: finds prefix matches", () => {
    const cb = vi.fn();
    fallbackSearch("gpt", MODELS, cb);
    expect(cb).toHaveBeenCalledWith([
      "gpt-3.5-turbo",
      "gpt-4",
      "gpt-4-32k",
      "gpt3.5",
      "gpt-neo",
      "gpt-3.5.2",
      "gpt4all",
    ]);
  });

  it("fallbackSearch: finds substring matches", () => {
    const cb = vi.fn();
    fallbackSearch("llama", MODELS, cb);
    expect(cb).toHaveBeenCalledWith(["llama-2"]);
  });

  it("fallbackSearch: finds no-separator matches", () => {
    const cb = vi.fn();
    fallbackSearch("gpt35", MODELS, cb);
    expect(cb).toHaveBeenCalledWith(["gpt-3.5-turbo", "gpt3.5", "gpt-3.5.2"]);
  });

  it("fallbackSearch: returns empty array when no matches", () => {
    const cb = vi.fn();
    fallbackSearch("not-a-model", MODELS, cb);
    expect(cb).toHaveBeenCalledWith([]);
  });

  it("searchModels: finds fuzzy matches (async)", async () => {
    const cb = vi.fn();
    const fuzzyInstance = loadFuzzyInstance();
    await searchModels("gpt3.5", MODELS, cb, fuzzyInstance);
    // Should call cb with at least one of the gpt-3.5 models
    const calledWith = cb.mock.calls[0][0];
    expect(calledWith.some((m: string) => m.includes("3.5"))).toBe(true);
  });

  it("searchModels: returns all if input is empty", async () => {
    const cb = vi.fn();
    const fuzzyInstance = loadFuzzyInstance();
    await searchModels("", MODELS, cb, fuzzyInstance);
    expect(cb).toHaveBeenCalledWith(MODELS);
  });
});
