import { describe, expect, it, vi } from "vitest";
import { ConversationProviderPersistence } from "./conversation-provider-persistence";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = () => done();
  });
  return { promise, resolve };
}

describe("ConversationProviderPersistence", () => {
  it("flushes the latest serialized provider selection before a send snapshot", async () => {
    const first = deferred();
    const writes: string[] = [];
    const persistence = new ConversationProviderPersistence(
      vi.fn(async (_conversationId, selection) => {
        writes.push(selection.configId);
        if (selection.configId === "codex-cli") await first.promise;
      }),
    );

    void persistence.enqueue("conversation-1", {
      configId: "codex-cli",
      modelId: "default",
    });
    void persistence.enqueue("conversation-1", {
      configId: "claude-code",
      modelId: "sonnet",
    });
    const flushed = persistence.flush("conversation-1");

    await vi.waitFor(() => expect(writes).toEqual(["codex-cli"]));
    first.resolve();
    await flushed;
    expect(writes).toEqual(["codex-cli", "claude-code"]);
  });

  it("does not block unrelated conversations", async () => {
    const blocked = deferred();
    const persistence = new ConversationProviderPersistence(
      vi.fn(async (conversationId) => {
        if (conversationId === "conversation-1") await blocked.promise;
      }),
    );

    void persistence.enqueue("conversation-1", {
      configId: "codex-cli",
      modelId: "default",
    });
    void persistence.enqueue("conversation-2", {
      configId: "claude-code",
      modelId: "default",
    });

    await expect(persistence.flush("conversation-2")).resolves.toBeUndefined();
    blocked.resolve();
    await persistence.flush("conversation-1");
  });

  it("keeps a rejected provider write visible to later send barriers", async () => {
    const persistence = new ConversationProviderPersistence(
      vi.fn(async () => {
        throw new Error("dexie write failed");
      }),
    );

    await expect(
      persistence.enqueue("conversation-1", {
        configId: "codex-cli",
        modelId: "default",
      }),
    ).rejects.toThrow("dexie write failed");
    await expect(persistence.flush("conversation-1")).rejects.toThrow(
      "dexie write failed",
    );
  });
});
