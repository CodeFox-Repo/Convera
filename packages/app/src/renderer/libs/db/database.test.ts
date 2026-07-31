/**
 * The member migration follows the durable lifecycle schema, so the check that
 * matters is "open a populated v4 database, upgrade, nothing was lost".
 */

import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LOCAL_HUMAN_MEMBER_ID,
  LOCAL_WORKSPACE_ID,
  memberIdForAgent,
  seedMembers,
  type Agent,
  type Conversation,
  type Message,
} from "./database";
import type { Member } from "@/shared/types/workspace";

const DB_NAME = "convera-migration-test";

/** The v1 schema exactly as it shipped, so the upgrade path is the real one. */
function openV1(): Dexie {
  const db = new Dexie(DB_NAME);
  db.version(1).stores({
    conversations: "id, agentId, updatedAt, [metadata.starred]",
    messages: "id, conversationId, createdAt",
    agents: "id, name, isBuiltIn, updatedAt",
    modelConfigs: "id, isDefault",
    settings: "key",
  });
  return db;
}

function openV4(): Dexie {
  const db = openV1();
  db.version(2).stores({
    conversations:
      "id, agentId, updatedAt, activeProviderId, [metadata.starred]",
    messages: "id, conversationId, turnId, [conversationId+turnId], createdAt",
  });
  db.version(3).stores({
    pendingTurns:
      "turnId, conversationId, requestId, state, createdAt, [conversationId+state]",
  });
  db.version(4).stores({
    pendingConversationDeletions:
      "conversationId, state, updatedAt, lastAttemptAt, nextAttemptAt",
  });
  return db;
}

function openV5(): Dexie {
  const db = openV4();
  db.version(5)
    .stores({ members: "id, workspaceId, kind" })
    .upgrade(seedMembers);
  return db;
}

const agent = (id: string, name: string): Agent => ({
  id,
  name,
  description: "",
  systemPrompt: "",
  disableToolReferences: [],
  selectedMCPs: [],
  isBuiltIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("v5 member migration", () => {
  beforeEach(async () => {
    await Dexie.delete(DB_NAME);

    const v4 = openV4();
    await v4.open();
    await v4
      .table<Agent>("agents")
      .bulkAdd([agent("agent-fizz", "Fizz"), agent("agent-honey", "Honey")]);
    await v4.table<Conversation>("conversations").add({
      id: "conv-1",
      title: "Existing chat",
      agentId: "agent-fizz",
      modelId: null,
      activeRevision: 0,
      activeProviderId: null,
      activeModelId: null,
      systemPrompt: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await v4.table<Message>("messages").bulkAdd([
      {
        id: "m1",
        conversationId: "conv-1",
        role: "user",
        content: "hello",
        createdAt: new Date(1),
      },
      {
        id: "m2",
        conversationId: "conv-1",
        role: "assistant",
        content: "hi there",
        createdAt: new Date(2),
      },
    ]);
    v4.close();
  });

  it("keeps existing conversations and messages intact", async () => {
    const db = openV5();
    await db.open();

    const conversations = await db
      .table<Conversation>("conversations")
      .toArray();
    const messages = await db
      .table<Message>("messages")
      .where("conversationId")
      .equals("conv-1")
      .sortBy("createdAt");

    expect(conversations).toHaveLength(1);
    expect(conversations[0].title).toBe("Existing chat");
    expect(messages.map((m) => m.content)).toEqual(["hello", "hi there"]);
    db.close();
  });

  it("creates one human member plus one per existing agent", async () => {
    const db = openV5();
    await db.open();

    const members = await db.table<Member>("members").toArray();
    expect(members.map((m) => m.id).sort()).toEqual(
      [
        LOCAL_HUMAN_MEMBER_ID,
        memberIdForAgent("agent-fizz"),
        memberIdForAgent("agent-honey"),
      ].sort(),
    );

    const fizz = members.find((m) => m.agentId === "agent-fizz");
    expect(fizz).toMatchObject({
      kind: "agent",
      name: "Fizz",
      workspaceId: LOCAL_WORKSPACE_ID,
    });
    expect(members.find((m) => m.id === LOCAL_HUMAN_MEMBER_ID)?.kind).toBe(
      "human",
    );
    db.close();
  });

  it("leaves senderId unset on old messages so the renderer falls back to role", async () => {
    const db = openV5();
    await db.open();

    const messages = await db.table<Message>("messages").toArray();
    expect(messages.every((m) => m.senderId === undefined)).toBe(true);
    db.close();
  });

  it("is idempotent when reopened", async () => {
    const first = openV5();
    await first.open();
    first.close();

    const second = openV5();
    await second.open();
    expect(await second.table<Member>("members").count()).toBe(3);
    second.close();
  });
});
