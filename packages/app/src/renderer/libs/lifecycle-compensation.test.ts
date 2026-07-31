import { describe, expect, it, vi } from "vitest";
import {
  commitThenFinalize,
  prepareThenCommit,
  quiesceThenCommitAndFinalize,
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

  it("captures the latest transcript only after an active turn is quiescent", async () => {
    const transcript = ["persisted-before-stream"];
    const snapshots: string[][] = [];

    await quiesceThenCommitAndFinalize(
      async () => {
        // Fake the authoritative terminal commit that races with deletion.
        transcript.push("user", "completed-assistant");
      },
      async () => {
        const snapshot = [...transcript];
        snapshots.push(snapshot);
        transcript.splice(0);
        return snapshot;
      },
      async () => undefined,
      async (snapshot) => {
        transcript.push(...snapshot);
      },
    );

    expect(snapshots).toEqual([
      ["persisted-before-stream", "user", "completed-assistant"],
    ]);
    expect(transcript).toEqual([]);
  });

  it("restores the post-quiesce snapshot when main deletion fails", async () => {
    const transcript = ["before"];

    await expect(
      quiesceThenCommitAndFinalize(
        async () => {
          transcript.push("completed-while-quiescing");
        },
        async () => {
          const snapshot = [...transcript];
          transcript.splice(0);
          return snapshot;
        },
        async () => {
          throw new Error("memory forget failed");
        },
        async (snapshot) => {
          transcript.push(...snapshot);
        },
      ),
    ).rejects.toThrow("memory forget failed");

    expect(transcript).toEqual(["before", "completed-while-quiescing"]);
  });
});
