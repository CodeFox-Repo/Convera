import { describe, expect, it, vi } from "vitest";
import {
  commitThenFinalize,
  prepareThenCommit,
} from "./lifecycle-compensation";

describe("conversation lifecycle compensation", () => {
  it("commits prepared cross-process state without rollback", async () => {
    const rollback = vi.fn();
    await expect(
      prepareThenCommit(
        async () => "prepared",
        async (prepared) => `${prepared}-committed`,
        rollback,
      ),
    ).resolves.toBe("prepared-committed");
    expect(rollback).not.toHaveBeenCalled();
  });

  it("rolls back prepared state when the Dexie commit fails", async () => {
    const rollback = vi.fn(async () => undefined);
    await expect(
      prepareThenCommit(
        async () => "prepared",
        async () => {
          throw new Error("dexie failed");
        },
        rollback,
      ),
    ).rejects.toThrow("dexie failed");
    expect(rollback).toHaveBeenCalledWith("prepared");
  });

  it("rolls back a local commit when main-process finalization fails", async () => {
    const rollback = vi.fn(async () => undefined);
    await expect(
      commitThenFinalize(
        async () => ({ snapshot: true }),
        async () => {
          throw new Error("main failed");
        },
        rollback,
      ),
    ).rejects.toThrow("main failed");
    expect(rollback).toHaveBeenCalledWith({ snapshot: true });
  });

  it("does not finalize when the local commit fails", async () => {
    const finalize = vi.fn();
    await expect(
      commitThenFinalize(
        async () => {
          throw new Error("dexie failed");
        },
        finalize,
        async () => undefined,
      ),
    ).rejects.toThrow("dexie failed");
    expect(finalize).not.toHaveBeenCalled();
  });
});
