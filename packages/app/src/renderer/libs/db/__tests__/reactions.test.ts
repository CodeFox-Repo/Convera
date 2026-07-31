/**
 * A reaction toggle that leaves an empty emoji key behind renders a chip with
 * a count of zero, so cleanup is the invariant worth locking down.
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, LOCAL_HUMAN_MEMBER_ID } from "../database";
import { toggleReaction } from "../hooks";

const MESSAGE_ID = "msg-reactions";

describe("toggleReaction", () => {
  beforeEach(async () => {
    await db.open();
    await db.messages.clear();
    await db.messages.add({
      id: MESSAGE_ID,
      conversationId: "conv-1",
      role: "assistant",
      content: "hi",
      createdAt: new Date(),
    });
  });

  it("adds, stacks, removes, and deletes the emoji key when empty", async () => {
    await toggleReaction(MESSAGE_ID, "👍", LOCAL_HUMAN_MEMBER_ID);
    expect((await db.messages.get(MESSAGE_ID))?.reactions).toEqual({
      "👍": [LOCAL_HUMAN_MEMBER_ID],
    });

    await toggleReaction(MESSAGE_ID, "👍", "agent:fizz");
    expect((await db.messages.get(MESSAGE_ID))?.reactions?.["👍"]).toEqual([
      LOCAL_HUMAN_MEMBER_ID,
      "agent:fizz",
    ]);

    await toggleReaction(MESSAGE_ID, "👍", LOCAL_HUMAN_MEMBER_ID);
    expect((await db.messages.get(MESSAGE_ID))?.reactions?.["👍"]).toEqual([
      "agent:fizz",
    ]);

    await toggleReaction(MESSAGE_ID, "👍", "agent:fizz");
    expect((await db.messages.get(MESSAGE_ID))?.reactions).toEqual({});
  });

  it("ignores a message that is not persisted yet", async () => {
    await expect(
      toggleReaction("not-saved", "🚀", LOCAL_HUMAN_MEMBER_ID),
    ).resolves.toBeUndefined();
  });
});
