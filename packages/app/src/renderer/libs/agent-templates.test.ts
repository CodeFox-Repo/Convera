/**
 * Hiring writes to two tables that must stay in step: an agent row and the
 * member identity that carries it into channels. A hire that produces only one
 * of them is the failure this locks down.
 */

import "fake-indexeddb/auto";
import { TEMPLATE_AVATARS } from "./template-avatars";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_TEMPLATES,
  ensureLocalHumanMember,
  ensureStarterTeam,
  fireAgent,
  hireTemplate,
  isHired,
  matchesQuery,
} from "./agent-templates";
import { db, LOCAL_HUMAN_MEMBER_ID, memberIdForAgent } from "./db";
import { createAgent } from "./stores/agent-store";

const elena = AGENT_TEMPLATES[0];

describe("agent templates", () => {
  it("ships templates with a real persona, not a placeholder", () => {
    expect(AGENT_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    for (const template of AGENT_TEMPLATES) {
      expect(template.systemPrompt.length).toBeGreaterThan(80);
      expect(template.tags.length).toBeGreaterThan(0);
      expect(template.avatar).not.toBe("");
    }
    expect(new Set(AGENT_TEMPLATES.map((t) => t.id)).size).toBe(
      AGENT_TEMPLATES.length,
    );
    expect(new Set(AGENT_TEMPLATES.map((t) => t.name)).size).toBe(
      AGENT_TEMPLATES.length,
    );
  });

  it("matches on name, role and tag but not on the description", () => {
    expect(matchesQuery(elena, "")).toBe(true);
    expect(matchesQuery(elena, "elena")).toBe(true);
    expect(matchesQuery(elena, "Code Reviewer")).toBe(true);
    expect(matchesQuery(elena, "refactor")).toBe(true);
    expect(matchesQuery(elena, "zzz")).toBe(false);
  });
});

describe("hire flow", () => {
  beforeEach(async () => {
    await db.open();
    await db.agents.clear();
    await db.members.clear();
  });

  it("creates the agent and its member together", async () => {
    const agent = await hireTemplate(elena);

    const stored = await db.agents.get(agent.id);
    expect(stored).toMatchObject({
      name: elena.name,
      description: elena.description,
      systemPrompt: elena.systemPrompt,
      isBuiltIn: false,
    });

    const member = await db.members.get(memberIdForAgent(agent.id));
    expect(member).toMatchObject({
      kind: "agent",
      name: elena.name,
      agentId: agent.id,
      // Hire prefers the settled portrait over the template emoji.
      avatar: TEMPLATE_AVATARS[elena.id] ?? elena.avatar,
      status: "idle",
    });
  });

  it("reports a template as hired once an agent carries its name", async () => {
    expect(isHired(elena, await db.agents.toArray())).toBe(false);
    await hireTemplate(elena);
    expect(isHired(elena, await db.agents.toArray())).toBe(true);
    expect(isHired(AGENT_TEMPLATES[1], await db.agents.toArray())).toBe(false);
  });

  it("adds the human member on a fresh install without clobbering an existing one", async () => {
    await ensureLocalHumanMember();
    expect(await db.members.get(LOCAL_HUMAN_MEMBER_ID)).toMatchObject({
      kind: "human",
    });

    await db.members.update(LOCAL_HUMAN_MEMBER_ID, { name: "Jackson" });
    await ensureLocalHumanMember();
    expect((await db.members.get(LOCAL_HUMAN_MEMBER_ID))?.name).toBe("Jackson");
  });

  it("firing removes both rows", async () => {
    const agent = await hireTemplate(elena);
    expect(await fireAgent(agent.id)).toBe(true);

    expect(await db.agents.get(agent.id)).toBeUndefined();
    expect(await db.members.get(memberIdForAgent(agent.id))).toBeUndefined();
  });
});

/**
 * A starter room without a description is a room that means nothing to the
 * agents standing in it, which is the whole point of seeding them.
 */
describe("starter channels", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.agents.clear(),
      db.members.clear(),
      db.channels.clear(),
      db.settings.clear(),
    ]);
  });

  it("gives every seeded room a description saying what it is for", async () => {
    await ensureStarterTeam();

    const channels = await db.channels.toArray();
    expect(channels.length).toBeGreaterThanOrEqual(5);
    for (const channel of channels) {
      expect(channel.description?.length ?? 0).toBeGreaterThan(20);
    }
    const announcements = channels.find((c) =>
      c.name.includes("announcements"),
    );
    expect(announcements?.description).toContain("onboarding hall");
  });

  it("fills in a missing description on an existing room, but never overwrites one", async () => {
    await ensureStarterTeam();
    const announcements = (await db.channels.toArray()).find((c) =>
      c.name.includes("announcements"),
    )!;
    const general = (await db.channels.toArray()).find((c) =>
      c.name.includes("general"),
    )!;

    // A workspace seeded before descriptions existed, plus one the user wrote.
    await db.channels.update(announcements.id, { description: undefined });
    await db.channels.update(general.id, { description: "Mine, hands off." });
    await db.settings.clear();

    await ensureStarterTeam();

    expect((await db.channels.get(announcements.id))?.description).toContain(
      "onboarding hall",
    );
    expect((await db.channels.get(general.id))?.description).toBe(
      "Mine, hands off.",
    );
    // Backfill fills rooms in, it does not duplicate them.
    expect((await db.channels.toArray()).length).toBe(5);
  });

  it("does not duplicate a renamed starter room on a version bump", async () => {
    await ensureStarterTeam();
    const announcements = (await db.channels.toArray()).find((c) =>
      c.name.includes("announcements"),
    )!;
    await db.channels.update(announcements.id, {
      name: "📣 company-news",
    });

    // What a STARTER_TEAM_VERSION bump does to an existing workspace.
    await db.settings.delete("starterTeamSeeded");
    await ensureStarterTeam();

    const channels = await db.channels.toArray();
    expect(channels.length).toBe(5);
    expect(channels.some((c) => c.name === "📣 company-news")).toBe(true);
    expect(channels.some((c) => c.name.includes("announcements"))).toBe(false);
  });

  it("does not resurrect a starter room the user deleted", async () => {
    await ensureStarterTeam();
    const docs = (await db.channels.toArray()).find((c) =>
      c.name.includes("docs"),
    )!;
    await db.channels.delete(docs.id);

    await db.settings.delete("starterTeamSeeded");
    await ensureStarterTeam();

    const channels = await db.channels.toArray();
    expect(channels.length).toBe(4);
    expect(channels.some((c) => c.name.includes("docs"))).toBe(false);
  });
});

/**
 * The mascot-to-human rename must only touch the shipped starters. A user's
 * own agent that happens to share a mascot name is theirs, prompt and all.
 */
describe("legacy starter rename", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.agents.clear(),
      db.members.clear(),
      db.channels.clear(),
      db.settings.clear(),
    ]);
  });

  it("leaves a user's own agent alone even when it wears a mascot name", async () => {
    const mine = await createAgent({
      name: "Kit",
      description: "my own",
      systemPrompt: "You are Kit, my personal assistant. Kit signs off as Kit.",
      disableToolReferences: [],
      selectedMCPs: [],
    });

    await ensureStarterTeam();

    const after = await db.agents.get(mine.id);
    expect(after?.name).toBe("Kit");
    expect(after?.systemPrompt).toContain("Kit signs off as Kit");
  });

  it("renames a genuine shipped starter, prompt and member row included", async () => {
    // Seed, then rewind one agent to its mascot-era shape.
    await ensureStarterTeam();
    const elena = (await db.agents.toArray()).find((a) => a.name === "Elena")!;
    await db.agents.update(elena.id, {
      name: "Sage",
      systemPrompt: elena.systemPrompt.replaceAll("Elena", "Sage"),
    });
    await db.members.update(memberIdForAgent(elena.id), { name: "Sage" });
    await db.settings.delete("starterTeamSeeded");

    await ensureStarterTeam();

    const after = await db.agents.get(elena.id);
    expect(after?.name).toBe("Elena");
    expect(after?.systemPrompt).toContain("You are Elena");
    expect((await db.members.get(memberIdForAgent(elena.id)))?.name).toBe(
      "Elena",
    );
  });
});
