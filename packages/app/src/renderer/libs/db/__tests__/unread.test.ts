/**
 * The unread badge against real storage: the pure counter is covered in the
 * channel-store suite, this one proves the Dexie query and the seen boundary
 * agree with it.
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, LOCAL_HUMAN_MEMBER_ID } from "..";
import { addMessage, countUnread } from "../hooks";
import { seenAt } from "../ui-state";

const AGENT = "member-agent";

/**
 * A whole test can run inside one millisecond, so nothing here reads the
 * clock: every message is stamped at an explicit offset from `EPOCH`.
 */
const EPOCH = 1_700_000_000_000;

async function post(
  conversationId: string,
  at: number,
  message: { role: "assistant" | "user"; content: string; senderId: string },
) {
  const id = await addMessage(conversationId, message);
  await db.messages.update(id, { createdAt: new Date(EPOCH + at) });
  return id;
}

async function unreadCounts(state: {
  lastSeen: Record<string, number>;
  epoch: number;
}) {
  const messages = await db.messages
    .where("createdAt")
    .above(new Date(Math.min(state.epoch, ...Object.values(state.lastSeen))))
    .toArray();
  return countUnread(messages, (id) => seenAt(state, id));
}

describe("unread counts over Dexie", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([db.messages.clear(), db.conversations.clear()]);
    await db.conversations.bulkAdd(
      ["watched", "elsewhere"].map((id) => ({
        id,
        title: id,
        agentId: null,
        modelId: null,
        activeRevision: 0,
        activeProviderId: null,
        activeModelId: null,
        systemPrompt: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
  });

  it("counts an agent's messages in a channel nobody is looking at", async () => {
    await post("elsewhere", 10, {
      role: "assistant",
      content: "standup at ten",
      senderId: AGENT,
    });
    await post("elsewhere", 20, {
      role: "assistant",
      content: "and bring the numbers",
      senderId: AGENT,
    });

    expect(await unreadCounts({ lastSeen: {}, epoch: EPOCH })).toEqual({
      elsewhere: 2,
    });
  });

  it("clears the count once the channel is marked seen", async () => {
    await post("elsewhere", 10, {
      role: "assistant",
      content: "standup at ten",
      senderId: AGENT,
    });

    const afterReading = { lastSeen: { elsewhere: EPOCH + 15 }, epoch: EPOCH };
    expect(await unreadCounts(afterReading)).toEqual({});

    await post("elsewhere", 20, {
      role: "assistant",
      content: "one more thing",
      senderId: AGENT,
    });
    expect(await unreadCounts(afterReading)).toEqual({ elsewhere: 1 });
  });

  it("does not count what you said yourself", async () => {
    await post("elsewhere", 10, {
      role: "user",
      content: "on my way",
      senderId: LOCAL_HUMAN_MEMBER_ID,
    });

    expect(await unreadCounts({ lastSeen: {}, epoch: EPOCH })).toEqual({});
  });

  it("ignores everything that predates the workspace epoch", async () => {
    await post("elsewhere", 10, {
      role: "assistant",
      content: "ancient history",
      senderId: AGENT,
    });

    // Someone installing this build should not open it to a sidebar lit up by
    // every message their agents ever sent.
    expect(await unreadCounts({ lastSeen: {}, epoch: EPOCH + 100 })).toEqual(
      {},
    );
  });
});
