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
  dedupeHiredAgents,
  ensureLocalHumanMember,
  ensureStarterTeam,
  STARTER_CHANNELS,
  fireAgent,
  hireTemplate,
  isHired,
  matchesQuery,
} from "./agent-templates";
import { db, LOCAL_HUMAN_MEMBER_ID, memberIdForAgent } from "./db";
import { createAgent } from "./stores/agent-store";
import { createChannel, setChannelDefaultAgent } from "./stores/channel-store";

const elena = AGENT_TEMPLATES[0];

describe("agent templates", () => {
  it("ships templates with a real persona, not a placeholder", () => {
    expect(AGENT_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    for (const template of AGENT_TEMPLATES) {
      expect(template.systemPrompt.length).toBeGreaterThan(80);
      // A persona has to carry a voice as well as a job, or cheap models make
      // every colleague sound the same — and it has to stay short enough that
      // the persona does not drown out the room it is standing in.
      expect(template.systemPrompt.split(/\s+/).length).toBeLessThanOrEqual(
        120,
      );
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
    const agent = await hireTemplate(elena, []);

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
    await hireTemplate(elena, []);
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
    const agent = await hireTemplate(elena, []);
    expect(await fireAgent(agent.id)).toBe(true);

    expect(await db.agents.get(agent.id)).toBeUndefined();
    expect(await db.members.get(memberIdForAgent(agent.id))).toBeUndefined();
  });

  it("does not re-hire a starter the user let go, on the next version bump", async () => {
    // Seeding hires by name whenever the layout version changes. That is right
    // for a colleague who was never hired and wrong for one who was dismissed:
    // walking back in overrules a decision the user made on purpose.
    await db.settings.clear();
    const elenaAgent = await hireTemplate(elena, []);
    await fireAgent(elenaAgent.id);

    await ensureStarterTeam();

    expect(
      (await db.agents.toArray()).some((row) => row.name === elena.name),
    ).toBe(false);
  });
});

/**
 * A colleague's desk is their channel membership: routing only ever considers
 * the roster of the room a message landed in, so an agent in zero channels is
 * hired into a workspace that can never reach them. These lock down both ends —
 * arriving into rooms, and leaving them behind on the way out.
 */
describe("hire and fire move channel membership", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.agents.clear(),
      db.members.clear(),
      db.channels.clear(),
      db.conversations.clear(),
      db.settings.clear(),
    ]);
  });

  const room = (name: string) =>
    createChannel({ name, groupId: null, memberIds: [LOCAL_HUMAN_MEMBER_ID] });

  it("puts the new hire in exactly the rooms they were given", async () => {
    const joined = await room("#review");
    const skipped = await room("#random");

    const agent = await hireTemplate(elena, [joined]);
    const memberId = memberIdForAgent(agent.id);

    expect((await db.channels.get(joined))?.memberIds).toContain(memberId);
    expect((await db.channels.get(skipped))?.memberIds).not.toContain(memberId);
  });

  it("hires into no room when none is offered, leaving the rosters untouched", async () => {
    const only = await room("#review");
    const agent = await hireTemplate(elena, []);

    expect((await db.channels.get(only))?.memberIds).toEqual([
      LOCAL_HUMAN_MEMBER_ID,
    ]);
    expect(await db.members.get(memberIdForAgent(agent.id))).toBeDefined();
  });

  it("takes a fired agent out of every roster, default responder included", async () => {
    const channelId = await room("#review");
    const agent = await hireTemplate(elena, [channelId]);
    const memberId = memberIdForAgent(agent.id);
    await setChannelDefaultAgent(channelId, memberId);

    await fireAgent(agent.id);

    const after = await db.channels.get(channelId);
    // A roster naming someone who no longer exists renders one member fewer
    // than it counts, and reports the inflated count to every agent that reads
    // the channel list.
    expect(after?.memberIds).toEqual([LOCAL_HUMAN_MEMBER_ID]);
    expect(after?.defaultAgentMemberId).toBeNull();
  });

  it("heals rosters left pointing at agents fired before the cleanup existed", async () => {
    const channelId = await room("#review");
    const agent = await hireTemplate(elena, [channelId]);
    const memberId = memberIdForAgent(agent.id);

    // Exactly what the old fire path left behind: agent and member gone, the
    // channel still naming them.
    await db.agents.delete(agent.id);
    await db.members.delete(memberId);
    expect((await db.channels.get(channelId))?.memberIds).toContain(memberId);

    await dedupeHiredAgents();

    expect((await db.channels.get(channelId))?.memberIds).toEqual([
      LOCAL_HUMAN_MEMBER_ID,
    ]);
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
    expect((await db.channels.toArray()).length).toBe(
      STARTER_CHANNELS.length,
    );
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
    expect(channels.length).toBe(STARTER_CHANNELS.length);
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
    expect(channels.length).toBe(STARTER_CHANNELS.length - 1);
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

  it("renames a mascot-era starter still holding a prompt from an older release", async () => {
    // The rename recognises a starter by its prompt, so editing the catalogue
    // would otherwise strand every workspace seeded before the edit: their
    // text matches no template and they keep the mascot name forever.
    const shippedBeforeVoices =
      "You are Sage, a senior code reviewer. Read the change as the person who will maintain it in a year: name the specific line, say what breaks, and propose the smaller edit. Lead with correctness and failure modes, then naming and structure; skip praise and style nits the formatter already handles. If the change looks right, say so in one line instead of manufacturing findings.";
    await ensureStarterTeam();
    const elena = (await db.agents.toArray()).find((a) => a.name === "Elena")!;
    await db.agents.update(elena.id, {
      name: "Sage",
      systemPrompt: shippedBeforeVoices,
    });
    await db.members.update(memberIdForAgent(elena.id), { name: "Sage" });
    await db.settings.delete("starterTeamSeeded");

    await ensureStarterTeam();

    const after = await db.agents.get(elena.id);
    expect(after?.name).toBe("Elena");
    expect(after?.systemPrompt).toBe(AGENT_TEMPLATES[0].systemPrompt);
  });

  it("upgrades an untouched older prompt in place, and never an edited one", async () => {
    await ensureStarterTeam();
    const rows = await db.agents.toArray();
    const elenaRow = rows.find((a) => a.name === "Elena")!;
    const mikaRow = rows.find((a) => a.name === "Mika")!;

    // One workspace-aged row still on the most recent outgoing text — the
    // entry a catalogue edit is likeliest to forget to record — and one the
    // user has made their own. The oldest shipped text is covered by the
    // mascot-rename case above.
    await db.agents.update(elenaRow.id, {
      systemPrompt:
        "You are Elena, a senior code reviewer. Read the change as the person who will maintain it in a year: name the specific line, say what breaks, and propose the smaller edit. Lead with correctness and failure modes, then naming and structure; skip praise and style nits the formatter already handles. If the change looks right, say so in one line instead of manufacturing findings. You speak precisely and a little dryly, and the warmth shows up as the one line of encouragement you actually mean rather than as padding around the criticism.",
    });
    await db.agents.update(mikaRow.id, {
      systemPrompt: "You are Mika. Be terse.",
    });
    await db.settings.delete("starterTeamSeeded");

    await ensureStarterTeam();

    expect((await db.agents.get(elenaRow.id))?.systemPrompt).toBe(
      AGENT_TEMPLATES[0].systemPrompt,
    );
    expect((await db.agents.get(mikaRow.id))?.systemPrompt).toBe(
      "You are Mika. Be terse.",
    );
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
