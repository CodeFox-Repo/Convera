import { appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TraceEventInput } from "@/shared/types/trace";
import { LocalTraceStore } from "./store";

function input(traceId: string, eventId: string): TraceEventInput {
  return {
    eventId,
    traceId,
    spanId: `span:${eventId}`,
    occurredAt: "2026-01-01T00:00:00.000Z",
    emitter: "main",
    type: "span.start",
    spanKind: "mission",
    name: "mission",
    classification: "P0",
  };
}

describe("LocalTraceStore", () => {
  it("serializes concurrent writes and deduplicates stable event ids", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-trace-store-"));
    try {
      const store = new LocalTraceStore(join(directory, "traces.jsonl"));
      await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          store.append(input("trace", `event-${index}`)),
        ),
      );
      await store.append(input("trace", "event-0"));
      const events = await store.read();
      expect(events).toHaveLength(20);
      expect(events.map((event) => event.sequence)).toEqual(
        Array.from({ length: 20 }, (_, index) => index + 1),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("repairs a corrupt crash tail before appending more events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-trace-store-"));
    const path = join(directory, "traces.jsonl");
    try {
      await new LocalTraceStore(path).append(input("trace", "first"));
      await appendFile(path, "{partial", "utf8");
      const recovered = new LocalTraceStore(path);
      await recovered.append(input("trace", "second"));
      expect((await recovered.read()).map((event) => event.eventId)).toEqual([
        "first",
        "second",
      ]);
      expect(await recovered.health()).toEqual({
        validEvents: 2,
        corruptLines: 1,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("can retry the same event after a disk write failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-trace-store-"));
    const path = join(directory, "traces.jsonl");
    try {
      await mkdir(path);
      const store = new LocalTraceStore(path);
      await expect(store.append(input("trace", "retry-me"))).rejects.toThrow();
      await rm(path, { recursive: true });
      await store.append(input("trace", "retry-me"));
      expect((await store.read()).map((event) => event.eventId)).toEqual([
        "retry-me",
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("retains whole recent traces instead of cutting a graph in half", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-trace-store-"));
    try {
      const store = new LocalTraceStore(join(directory, "traces.jsonl"), {
        maxEvents: 4,
      });
      await store.append([
        input("old", "old-1"),
        input("old", "old-2"),
        input("old", "old-3"),
      ]);
      await store.append([input("new", "new-1"), input("new", "new-2")]);
      expect(await store.listTraceIds()).toEqual(["new"]);
      expect(await store.read()).toHaveLength(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
