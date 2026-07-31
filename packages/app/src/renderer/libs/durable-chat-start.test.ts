import { describe, expect, it, vi } from "vitest";
import { persistBeforeStartChat } from "./durable-chat-start";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = () => done();
  });
  return { promise, resolve };
}

describe("durable chat start", () => {
  it("does not cross IPC until the pending transcript is durable", async () => {
    const persisted = deferred();
    const startChat = vi.fn(async () => "accepted");
    const result = persistBeforeStartChat(
      async () => persisted.promise,
      startChat,
    );

    await Promise.resolve();
    expect(startChat).not.toHaveBeenCalled();
    persisted.resolve();
    await expect(result).resolves.toBe("accepted");
    expect(startChat).toHaveBeenCalledOnce();
  });

  it("never starts provider work when the Dexie stage fails", async () => {
    const startChat = vi.fn();
    await expect(
      persistBeforeStartChat(async () => {
        throw new Error("dexie unavailable");
      }, startChat),
    ).rejects.toThrow("dexie unavailable");
    expect(startChat).not.toHaveBeenCalled();
  });
});
