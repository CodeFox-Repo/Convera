/**
 * Talent market catalog.
 *
 * A template is a blueprint, not a participant: hiring one instantiates a real
 * Agent plus the Member that carries it into channels (§1.4 — the agent is the
 * durable entity, the member is how it shows up).
 */

import type { AgentTemplate } from "@/shared/types/workspace";
import { TEMPLATE_AVATARS } from "./template-avatars";
import {
  db,
  memberIdForAgent,
  LOCAL_HUMAN_MEMBER,
  LOCAL_HUMAN_MEMBER_ID,
  type Agent,
} from "./db";
import { createAgent, deleteAgent } from "./stores/agent-store";
import {
  DEFAULT_LOCAL_AI_MODEL_ID,
  DEFAULT_LOCAL_AI_PROVIDER_ID,
} from "./local-ai";
import { createChannel } from "./stores/channel-store";
import { upsertAgentMember } from "./stores/member-store";

export type { AgentTemplate };

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "sage",
    name: "Elena",
    avatar: "🔍",
    role: "Code reviewer",
    description: "Reads a diff the way the next maintainer will.",
    systemPrompt:
      "You are Elena, a senior code reviewer. Read the change as the person who will maintain it in a year: name the specific line, say what breaks, and propose the smaller edit. Lead with correctness and failure modes, then naming and structure; skip praise and style nits the formatter already handles. If the change looks right, say so in one line instead of manufacturing findings.",
    tags: ["review", "quality", "refactor"],
  },
  {
    id: "patch",
    name: "Mika",
    avatar: "🐞",
    role: "Debugger",
    description: "Chases the root cause instead of the stack trace.",
    systemPrompt:
      "You are Mika, a debugger. A report names a symptom, so your first move is always to establish how to reproduce it and what the smallest failing case is. Form one hypothesis at a time, say what observation would falsify it, and ask for the log line or value that settles it. Fix causes where all callers route through, never the one call site that happened to be reported.",
    tags: ["debug", "diagnosis", "runtime"],
  },
  {
    id: "atlas",
    name: "Omar",
    avatar: "🏛️",
    role: "Architect",
    description: "Weighs the boring option before the clever one.",
    systemPrompt:
      "You are Omar, a systems architect. For any design question give two or three real options with their trade-offs — data model, failure behaviour, migration cost, what it forecloses — and then state your recommendation plainly. Prefer an existing library or platform feature over a bespoke layer, and say when the simple version is enough. Flag the decisions that are expensive to reverse; treat the rest as cheap to change later.",
    tags: ["design", "trade-offs", "systems"],
  },
  {
    id: "quill",
    name: "Noah",
    avatar: "✍️",
    role: "Tech writer",
    description: "Turns working code into docs someone can follow.",
    systemPrompt:
      "You are Noah, a technical writer. Write for the reader who is mid-task and impatient: concrete nouns, runnable examples, the prerequisite stated before the step that needs it. Cut hedging, marketing adjectives, and any sentence that survives deletion. When the code and the docs disagree, ask which one is wrong rather than papering over it.",
    tags: ["docs", "writing", "onboarding"],
  },
  {
    id: "vera",
    name: "Vera",
    avatar: "🧭",
    role: "Product thinker",
    description: "Asks who this is for before asking how to build it.",
    systemPrompt:
      "You are Vera, a product thinker. Start from the user and the job they are stuck on, not the feature that was requested; if the request already encodes a solution, surface the underlying problem it assumes. Push for the smallest slice that would prove or kill the idea, and name what you would measure. Say when the honest answer is that the feature should not be built.",
    tags: ["product", "scoping", "discovery"],
  },
  {
    id: "kit",
    name: "Hana",
    avatar: "🧪",
    role: "Test engineer",
    description: "Finds the input nobody thought to try.",
    systemPrompt:
      "You are Hana, a test engineer. Given a change, enumerate the cases that actually distinguish working code from broken code: boundaries, empty and huge inputs, concurrency, partial failure, and the error paths people forget to assert on. Prefer a few tests that fail loudly for real reasons over broad coverage that never goes red. Point out untestable code and suggest the seam that would make it testable.",
    tags: ["testing", "edge-cases", "quality"],
  },
  {
    id: "rook",
    name: "Ivan",
    avatar: "♟️",
    role: "Devil's advocate",
    description: "Argues the other side so reality doesn't have to.",
    systemPrompt:
      "You are Ivan. Your job is to attack the plan in front of you: name the assumption it rests on, the scenario where it fails, and the cost of being wrong. Argue in good faith with specifics rather than reflexive contrarianism, and concede immediately when the answer holds up. Close every critique by stating what evidence would change your mind.",
    tags: ["critique", "risk", "review"],
  },
  {
    id: "pip",
    name: "Zoe",
    avatar: "📚",
    role: "Research librarian",
    description: "Brings back sources, not vibes.",
    systemPrompt:
      "You are Zoe, a research librarian. Answer with sources: the doc page, the changelog entry, the issue thread — and quote the line that actually supports the claim. Separate what the source says from what you are inferring, and say plainly when you could not find an authoritative answer. Note the publication date whenever a fast-moving API is involved.",
    tags: ["research", "sources", "reference"],
  },
];

/**
 * Hires a template into this workspace: one Agent row plus its Member.
 * The emoji lands on the member because that is what the message rows and the
 * roster render.
 */
/**
 * A fresh workspace should feel like joining a small team, not an empty room.
 * Hires three starter colleagues once, on first launch; idempotent, and never
 * re-hires anyone the user has fired (it only runs while NO hired agent
 * exists at all).
 */
const STARTER_TEMPLATE_IDS = ["sage", "patch", "quill"] as const;

/**
 * Heals damage from earlier seeding bugs: duplicate hires (StrictMode double
 * run before the claim flag existed) and members orphaned by deleted agents.
 * Keeps the oldest of each duplicate name so channel references stay valid.
 */
export async function dedupeHiredAgents(): Promise<void> {
  await db.transaction("rw", [db.agents, db.members], async () => {
    const agents = await db.agents.toArray();
    const keptByName = new Map<string, Agent>();
    for (const agent of agents.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    )) {
      if (agent.isBuiltIn) continue;
      const kept = keptByName.get(agent.name);
      if (!kept) {
        keptByName.set(agent.name, agent);
        continue;
      }
      await db.agents.delete(agent.id);
      await db.members.delete(memberIdForAgent(agent.id));
    }

    // Members whose agent row is gone are unrenderable ghosts.
    const liveAgentIds = new Set((await db.agents.toArray()).map((a) => a.id));
    const members = await db.members.toArray();
    for (const member of members) {
      if (
        member.kind === "agent" &&
        member.agentId &&
        !liveAgentIds.has(member.agentId)
      ) {
        await db.members.delete(member.id);
      }
    }
  });
}

/**
 * The starter personas shipped with tool-mascot names before they were given
 * human ones. Workspaces seeded back then still hold the old rows, and three
 * separate lookups (portrait upgrade, channel seeding, `isHired`) match a
 * template to its agent BY NAME — so the rows have to be renamed, not just
 * the catalog.
 */
const RENAMED_STARTERS: Record<string, string> = {
  Sage: "Elena",
  Patch: "Mika",
  Atlas: "Omar",
  Quill: "Noah",
  Kit: "Hana",
  Rook: "Ivan",
  Pip: "Zoe",
};

async function renameLegacyStarters(): Promise<void> {
  const agents = await db.agents.filter((agent) => !agent.isBuiltIn).toArray();
  const taken = new Set(agents.map((agent) => agent.name));
  for (const agent of agents) {
    const renamed = RENAMED_STARTERS[agent.name];
    // A colleague already standing under the new name means this workspace
    // has both; renaming would collide, so leave the old one for dedupe.
    if (!renamed || taken.has(renamed)) continue;
    // Only the shipped starter is a starter: a user's own agent that happens
    // to be called Kit must not become Hana. The shipped prompt (with the new
    // name swapped back) is the fingerprint; an edited prompt means the agent
    // is theirs now, and their naming is theirs too.
    const template = AGENT_TEMPLATES.find((t) => t.name === renamed);
    const shippedPrompt = template?.systemPrompt.replaceAll(
      renamed,
      agent.name,
    );
    if (agent.systemPrompt !== shippedPrompt) continue;
    taken.delete(agent.name);
    taken.add(renamed);
    await db.agents.update(agent.id, {
      name: renamed,
      systemPrompt: template!.systemPrompt,
      updatedAt: new Date(),
    });
    await db.members.update(memberIdForAgent(agent.id), { name: renamed });
  }
}

/** Members hired before the portraits existed still carry the emoji. */
async function upgradeEmojiAvatars(): Promise<void> {
  const members = await db.members.toArray();
  for (const member of members) {
    if (member.kind !== "agent" || member.avatar?.startsWith("data:")) continue;
    const template = AGENT_TEMPLATES.find((t) => t.name === member.name);
    const portrait = template && TEMPLATE_AVATARS[template.id];
    if (portrait) await db.members.update(member.id, { avatar: portrait });
  }
}

/**
 * Default channel layout for a fresh workspace — Slack's proven starter shape.
 * #general has every starter agent as members (ask anything, anyone may be
 * @-mentioned); the focused rooms carry the matching specialist as their
 * default responder so a bare message just works.
 */
/**
 * The rooms a new workspace starts with.
 *
 * Each carries an emoji because a name alone makes five channels read as one
 * undifferentiated list; the glyph is what the eye finds before the word.
 * They are part of the name, so renaming or deleting a channel behaves
 * exactly as it does for any other.
 */
/**
 * The description is written for the colleague reading it, agent or human: it
 * says what belongs in the room, not what the room is called again. This is
 * the platform's only chance to tell an agent what #announcements *means*
 * without stuffing it into a prompt.
 */
const STARTER_CHANNELS: Array<{
  name: string;
  description: string;
  agentTemplateIds: string[];
}> = [
  {
    // The onboarding hall: project intros and direction land here, and every
    // agent carries it as shared org context into every other room.
    name: "📣 announcements",
    description:
      "The onboarding hall. Project introductions, direction and decisions that affect everyone are posted here — read it to understand what the team is working on and why.",
    agentTemplateIds: ["sage", "patch", "quill"],
  },
  {
    name: "💬 general",
    description:
      "Open chat for the whole team. Anything that does not have a room of its own: questions, half-formed ideas, and the conversation that happens between the work.",
    agentTemplateIds: ["sage", "patch", "quill"],
  },
  {
    name: "🔍 code-review",
    description:
      "Diffs and pull requests go here for a second pair of eyes. Bring the change and the context behind it; expect correctness and failure modes before style.",
    agentTemplateIds: ["sage"],
  },
  {
    name: "🐛 debugging",
    description:
      "Broken behaviour, stack traces and mysteries in progress. Bring the symptom and how to reproduce it; the work here is finding the root cause, not patching the report.",
    agentTemplateIds: ["patch"],
  },
  {
    name: "📖 docs",
    description:
      "Documentation, READMEs and onboarding writing. Where working code gets turned into something the next person can follow.",
    agentTemplateIds: ["quill"],
  },
];

/**
 * Creates the rooms that are missing, and fills in a description on the ones
 * that already exist without one — a workspace seeded before descriptions
 * existed has an #announcements that says nothing about what it is for, which
 * is precisely the context agents are supposed to be able to read.
 *
 * Identity is tracked by id in the `starterChannelIds` setting, not by name:
 * a renamed room is still that room and must not spawn a twin, and a deleted
 * room was deleted on purpose and must not come back. Name matching remains
 * only as the adoption path for workspaces seeded before ids were recorded.
 */
async function seedStarterChannels(): Promise<void> {
  const agents = await db.agents.toArray();
  const channels = await db.channels.toArray();
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const byName = new Map(channels.map((channel) => [channel.name, channel]));
  const seededSetting = await db.settings.get("starterChannelIds");
  const seededIds: Record<string, string> =
    seededSetting && typeof seededSetting.value === "object"
      ? { ...(seededSetting.value as Record<string, string>) }
      : {};

  const memberIdForTemplate = (templateId: string): string | null => {
    const template = AGENT_TEMPLATES.find((t) => t.id === templateId);
    const agent = template && agents.find((a) => a.name === template.name);
    return agent ? memberIdForAgent(agent.id) : null;
  };

  for (const spec of STARTER_CHANNELS) {
    const seededId = seededIds[spec.name];
    if (seededId && !byId.has(seededId)) {
      // The user deleted this starter room. Their call stands.
      continue;
    }
    const already = seededId ? byId.get(seededId) : byName.get(spec.name);
    if (already) {
      seededIds[spec.name] = already.id;
      // Never overwrite one someone has written themselves.
      if (!already.description?.trim()) {
        await db.channels.update(already.id, {
          description: spec.description,
          updatedAt: new Date(),
        });
      }
      continue;
    }
    const agentMemberIds = spec.agentTemplateIds
      .map(memberIdForTemplate)
      .filter((id): id is string => id !== null);
    seededIds[spec.name] = await createChannel({
      name: spec.name,
      description: spec.description,
      groupId: null,
      memberIds: [LOCAL_HUMAN_MEMBER_ID, ...agentMemberIds],
    });
  }

  await db.settings.put({
    key: "starterChannelIds",
    value: seededIds,
    updatedAt: new Date(),
  });
}

/**
 * Bump when the starter layout changes so existing workspaces pick it up. The
 * seed itself is idempotent (hire skips existing names, channels skip existing
 * names), so a re-run only ever fills in what is missing.
 */
const STARTER_TEAM_VERSION = 4;

export async function ensureStarterTeam(): Promise<void> {
  await renameLegacyStarters();
  await dedupeHiredAgents();
  await upgradeEmojiAvatars();
  // Claim the version atomically first: StrictMode double-invokes effects, and
  // two concurrent runs would otherwise both see an empty roster.
  const claimed = await db.transaction("rw", db.settings, async () => {
    const existing = await db.settings.get("starterTeamSeeded");
    if (existing && existing.value === STARTER_TEAM_VERSION) return false;
    await db.settings.put({
      key: "starterTeamSeeded",
      value: STARTER_TEAM_VERSION,
      updatedAt: new Date(),
    });
    return true;
  });
  if (!claimed) return;

  const hiredNames = new Set(
    (await db.agents.filter((agent) => !agent.isBuiltIn).toArray()).map(
      (agent) => agent.name,
    ),
  );
  for (const id of STARTER_TEMPLATE_IDS) {
    const template = AGENT_TEMPLATES.find((t) => t.id === id);
    if (template && !hiredNames.has(template.name))
      await hireTemplate(template);
  }
  await seedStarterChannels();
}

export async function hireTemplate(template: AgentTemplate): Promise<Agent> {
  const agent = await createAgent({
    name: template.name,
    description: template.description,
    systemPrompt: template.systemPrompt,
    disableToolReferences: [],
    selectedMCPs: [],
    // Pinned rather than inherited: a colleague that follows whatever model the
    // conversation happens to be on can land on a CLI provider, which never
    // returns in the browser build and leaves it stuck at "working".
    providerId: DEFAULT_LOCAL_AI_PROVIDER_ID,
    modelId: DEFAULT_LOCAL_AI_MODEL_ID,
  });
  await upsertAgentMember(agent);
  await db.members.update(memberIdForAgent(agent.id), {
    // Portrait when we have one; the template emoji otherwise.
    avatar: TEMPLATE_AVATARS[template.id] ?? template.avatar,
  });
  return agent;
}

/**
 * A database created straight at v3 never runs the v2 upgrade hook, so the
 * human member row is missing on fresh installs and the roster counts zero
 * people. Add it once, never overwrite — the row may have been renamed.
 */
export async function ensureLocalHumanMember(): Promise<void> {
  if (await db.members.get(LOCAL_HUMAN_MEMBER_ID)) return;
  await db.members.put(LOCAL_HUMAN_MEMBER);
}

/** Removes an agent from the org: its member identity goes with it. */
export async function fireAgent(agentId: string): Promise<boolean> {
  const removed = await deleteAgent(agentId);
  if (removed) {
    await db.members.delete(memberIdForAgent(agentId));
  }
  return removed;
}

/** Hiring is idempotent by name — the roster is a set of people, not a log. */
export function isHired(
  template: AgentTemplate,
  agents: Pick<Agent, "name">[],
): boolean {
  return agents.some((agent) => agent.name === template.name);
}

export function matchesQuery(template: AgentTemplate, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [template.name, template.role, ...template.tags].some((field) =>
    field.toLowerCase().includes(needle),
  );
}
