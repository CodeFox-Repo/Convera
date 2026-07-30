import { describe, expect, it } from "vitest";
import {
  MAX_MEMORY_BATCH_SIZE,
  MIN_MEMORY_BATCH_SIZE,
  isValidMemoryBatchSize,
} from "./memory-settings-constraints";

describe("renderer memory settings constraints", () => {
  it("matches the privileged batch size contract", () => {
    expect(MIN_MEMORY_BATCH_SIZE).toBe(2);
    expect(MAX_MEMORY_BATCH_SIZE).toBe(100);
    expect(isValidMemoryBatchSize(2)).toBe(true);
    expect(isValidMemoryBatchSize(100)).toBe(true);
    expect(isValidMemoryBatchSize(1)).toBe(false);
    expect(isValidMemoryBatchSize(2.5)).toBe(false);
    expect(isValidMemoryBatchSize(101)).toBe(false);
  });
});
