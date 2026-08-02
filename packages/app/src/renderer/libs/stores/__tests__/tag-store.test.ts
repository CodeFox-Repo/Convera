import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, LOCAL_WORKSPACE_ID, type Channel, type Member } from "../../db";
import {
  createTag,
  deleteTag,
  memberHasPermission,
  normalizeTagName,
  renameTag,
  setChannelVisibility,
  setMemberTag,
} from "../tag-store";
import { canViewChannel, resolveViewer } from "../../workspace-perception";

const HUMAN = "me";
const AGENT = "agent:fizz";

function member(id: string, kind: Member["kind"], tags?: string[]): Member {
  return {
    id,
    workspaceId: LOCAL_WORKSPACE_ID,
    kind,
    name: id,
    avatar: null,
    agentId: kind === "agent" ? id.slice("agent:".length) : null,
    status: "idle",
    ...(tags ? { tags } : {}),
  };
}

function channel(id: string, overrides: Partial<Channel> = {}): Channel {
  return {
    id,
    workspaceId: LOCAL_WORKSPACE_ID,
    groupId: null,
    name: id,
    kind: "channel",
    isPrivate: false,
    memberIds: [HUMAN],
    conversationId: `conversation-${id}`,
    defaultAgentMemberId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all([db.tags.clear(), db.members.clear(), db.channels.clear()]);
  await db.members.bulkPut([member(HUMAN, "human"), member(AGENT, "agent")]);
});

describe("tag names", () => {
  it("folds spacing and case so one role is one tag", () => {
    expect(normalizeTagName("  HR Team ")).toBe("hr-team");
    expect(normalizeTagName("On/Call!")).toBe("oncall");
    expect(normalizeTagName("   ")).toBe("");
  });

  it("keeps a non-Latin name instead of stripping it to nothing", () => {
    // Stripping to ASCII emptied every Chinese tag, and an empty name is
    // dropped by each caller — so the tag silently never existed.
    expect(normalizeTagName("设计")).toBe("设计");
    expect(normalizeTagName("研发 团队")).toBe("研发-团队");
    expect(normalizeTagName("Ünder!")).toBe("ünder");
  });

  it("does not create a second row for a name that already exists", async () => {
    const first = await createTag("Finance");
    const second = await createTag("finance");
    expect(second?.id).toBe(first?.id);
    expect(await db.tags.count()).toBe(1);
  });
});

describe("permissions", () => {
  it("grants through whichever tag carries the permission", async () => {
    await createTag("auditor", { permissions: ["channel:view-all"] });
    await createTag("intern");
    await setMemberTag(AGENT, "intern", true);
    expect(await memberHasPermission(AGENT, "channel:view-all")).toBe(false);

    await setMemberTag(AGENT, "auditor", true);
    expect(await memberHasPermission(AGENT, "channel:view-all")).toBe(true);
    // Holding a tag never implies powers it was not given.
    expect(await memberHasPermission(AGENT, "tag:manage")).toBe(false);
  });

  it("treats an agent exactly as it treats a human", async () => {
    await createTag("hr");
    await db.channels.put(channel("payroll", { visibleToTags: ["hr"] }));
    const room = await db.channels.get("payroll");

    for (const id of [HUMAN, AGENT]) {
      expect(canViewChannel(await resolveViewer(id), room!)).toBe(false);
      await setMemberTag(id, "hr", true);
      expect(canViewChannel(await resolveViewer(id), room!)).toBe(true);
    }
  });
});

describe("editing a tag", () => {
  it("rewrites every reference on rename, so nothing silently stops matching", async () => {
    const tag = await createTag("hr");
    await setMemberTag(HUMAN, "hr", true);
    await db.channels.put(channel("payroll", { visibleToTags: ["hr"] }));

    await renameTag(tag!.id, "People Ops");

    expect((await db.members.get(HUMAN))?.tags).toEqual(["people-ops"]);
    expect((await db.channels.get("payroll"))?.visibleToTags).toEqual([
      "people-ops",
    ]);
  });

  it("refuses to rename or delete a built-in tag", async () => {
    const now = new Date();
    await db.tags.put({
      id: "admin",
      workspaceId: LOCAL_WORKSPACE_ID,
      name: "admin",
      permissions: ["channel:view-all"],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
    });

    await renameTag("admin", "owner");
    await deleteTag("admin");

    expect((await db.tags.get("admin"))?.name).toBe("admin");
  });

  it("opens a channel rather than stranding it when its tag is deleted", async () => {
    const tag = await createTag("hr");
    await setMemberTag(HUMAN, "hr", true);
    await db.channels.put(channel("payroll", { visibleToTags: ["hr"] }));

    await deleteTag(tag!.id);

    // A requirement nobody can hold would lock the room permanently.
    expect((await db.channels.get("payroll"))?.visibleToTags).toEqual([]);
    expect((await db.members.get(HUMAN))?.tags).toEqual([]);
    expect(
      canViewChannel(
        await resolveViewer(AGENT),
        (await db.channels.get("payroll"))!,
      ),
    ).toBe(true);
  });
});

describe("setting a channel's audience", () => {
  it("creates named tags and clears the pre-tag private flag", async () => {
    await db.channels.put(channel("payroll", { isPrivate: true }));

    await setChannelVisibility("payroll", ["HR", "finance"]);

    const room = await db.channels.get("payroll");
    expect(room?.visibleToTags).toEqual(["hr", "finance"]);
    // Left set, isPrivate would keep out exactly the people the tags admit.
    expect(room?.isPrivate).toBe(false);
    expect((await db.tags.toArray()).map((tag) => tag.name).sort()).toEqual([
      "finance",
      "hr",
    ]);
  });

  it("returns a channel to the whole workspace when its tags are cleared", async () => {
    await db.channels.put(channel("payroll", { visibleToTags: ["hr"] }));
    await setChannelVisibility("payroll", []);
    expect(
      canViewChannel(
        await resolveViewer(AGENT),
        (await db.channels.get("payroll"))!,
      ),
    ).toBe(true);
  });
});
