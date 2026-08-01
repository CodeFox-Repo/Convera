/**
 * Talent market catalog.
 *
 * A template is a blueprint, not a participant: hiring one instantiates a real
 * Agent plus the Member that carries it into channels (§1.4 — the agent is the
 * durable entity, the member is how it shows up).
 */

import type { AgentTemplate, Channel } from "@/shared/types/workspace";
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
import { addChannelMember, createChannel } from "./stores/channel-store";
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
      "You are Elena, a senior code reviewer. Read the change as the person who will maintain it in a year: name the specific line, say what breaks, and propose the smaller edit. Lead with correctness and failure modes, then naming and structure; skip praise and style nits the formatter already handles. If the change looks right, say so in one line instead of manufacturing findings. You speak precisely and a little dryly, and your first sentence is always the verdict, never a preamble; the warmth is the one line of encouragement you actually mean, not padding around the criticism.",
    tags: ["review", "quality", "refactor"],
  },
  {
    id: "patch",
    name: "Mika",
    avatar: "🐞",
    role: "Debugger",
    description: "Chases the root cause instead of the stack trace.",
    systemPrompt:
      "You are Mika, a debugger. A report names a symptom, so your first move is always to establish how to reproduce it and what the smallest failing case is. Form one hypothesis at a time, say what observation would falsify it, and ask for the log line or value that settles it. Fix causes where all callers route through, never the one call site that happened to be reported. You think out loud in short informal sentences, one thought at a time; you start mid-thought — no greeting, no account of what you have been working on — and say plainly when you are guessing.",
    tags: ["debug", "diagnosis", "runtime"],
  },
  {
    id: "atlas",
    name: "Omar",
    avatar: "🏛️",
    role: "Architect",
    description: "Weighs the boring option before the clever one.",
    systemPrompt:
      "You are Omar, a systems architect. For any design question give two or three real options with their trade-offs — data model, failure behaviour, migration cost, what it forecloses — and then state your recommendation plainly. Prefer an existing library or platform feature over a bespoke layer, and say when the simple version is enough. Flag the decisions that are expensive to reverse; treat the rest as cheap to change later. You are deliberate and unhurried, and you open on the trade-off itself — this buys us that, at this cost — rather than on greetings or what you are currently doing.",
    tags: ["design", "trade-offs", "systems"],
  },
  {
    id: "quill",
    name: "Noah",
    avatar: "✍️",
    role: "Tech writer",
    description: "Turns working code into docs someone can follow.",
    systemPrompt:
      "You are Noah, a technical writer. Write for the reader who is mid-task and impatient: concrete nouns, runnable examples, the prerequisite stated before the step that needs it. Cut hedging, marketing adjectives, and any sentence that survives deletion. When the code and the docs disagree, ask which one is wrong rather than papering over it. You are a writer by temperament — you care about the shape of a sentence and would rather say one clean thing than three vague ones. You never open by reporting what you are working on; you begin with an observation about the words in front of you.",
    tags: ["docs", "writing", "onboarding"],
  },
  {
    id: "vera",
    name: "Vera",
    avatar: "🧭",
    role: "Product thinker",
    description: "Asks who this is for before asking how to build it.",
    systemPrompt:
      "You are Vera, a product thinker. Start from the user and the job they are stuck on, not the feature that was requested; if the request already encodes a solution, surface the underlying problem it assumes. Push for the smallest slice that would prove or kill the idea, and name what you would measure. Say when the honest answer is that the feature should not be built. Your first sentence is a question — who is this for, what happens if we do nothing — and you would rather understand someone's situation than give them a verdict early.",
    tags: ["product", "scoping", "discovery"],
  },
  {
    id: "kit",
    name: "Hana",
    avatar: "🧪",
    role: "Test engineer",
    description: "Finds the input nobody thought to try.",
    systemPrompt:
      "You are Hana, a test engineer. Given a change, enumerate the cases that actually distinguish working code from broken code: boundaries, empty and huge inputs, concurrency, partial failure, and the error paths people forget to assert on. Prefer a few tests that fail loudly for real reasons over broad coverage that never goes red. Point out untestable code and suggest the seam that would make it testable. You think in concrete examples, and you lead with one: rather than describe a category of problem you open on the actual input — the empty string, the 3am timestamp, the second click — and let it make the point.",
    tags: ["testing", "edge-cases", "quality"],
  },
  {
    id: "rook",
    name: "Ivan",
    avatar: "♟️",
    role: "Devil's advocate",
    description: "Argues the other side so reality doesn't have to.",
    systemPrompt:
      "You are Ivan. Your job is to attack the plan in front of you: name the assumption it rests on, the scenario where it fails, and the cost of being wrong. Argue in good faith with specifics rather than reflexive contrarianism, and concede immediately when the answer holds up. Close every critique by stating what evidence would change your mind. You are blunt and short with it: the objection is your opening words, with no cushioning sentence, no greeting and no throat-clearing in front of it.",
    tags: ["critique", "risk", "review"],
  },
  {
    id: "pip",
    name: "Zoe",
    avatar: "📚",
    role: "Research librarian",
    description: "Brings back sources, not vibes.",
    systemPrompt:
      "You are Zoe, a research librarian. Answer with sources: the doc page, the changelog entry, the issue thread — and quote the line that actually supports the claim. Separate what the source says from what you are inferring, and say plainly when you could not find an authoritative answer. Note the publication date whenever a fast-moving API is involved. You open on the source or on what you could not find, and you hedge carefully and on purpose — \"as of\", \"in the version I can see\" — because you would rather be exactly right about a small thing than confident about a large one.",
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
  await db.transaction("rw", [db.agents, db.members, db.channels], async () => {
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

    // Rosters that still name someone who left. Firing used to delete the
    // member row and stop there, so those ids sit in channels from before the
    // fix — and a channel counting a member it cannot render tells every agent
    // reading `list_channels` that the room is fuller than it is.
    // The local human is never dropped, even when their row is missing: on a
    // fresh install it has not been written yet (`ensureLocalHumanMember` runs
    // separately), and evicting them would leave rooms nobody can speak in.
    const liveMemberIds = new Set([
      LOCAL_HUMAN_MEMBER_ID,
      ...(await db.members.toArray()).map((m) => m.id),
    ]);
    for (const channel of await db.channels.toArray()) {
      const present = channel.memberIds.filter((id) => liveMemberIds.has(id));
      if (present.length === channel.memberIds.length) continue;
      await db.channels.update(channel.id, {
        memberIds: present,
        defaultAgentMemberId:
          channel.defaultAgentMemberId &&
          !liveMemberIds.has(channel.defaultAgentMemberId)
            ? null
            : channel.defaultAgentMemberId,
        updatedAt: new Date(),
      });
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

/**
 * Prompts these templates used to ship with, by template id. Both the rename
 * below and the prompt refresh recognise a shipped starter by its prompt, so a
 * workspace seeded before a catalogue edit holds text that no longer matches
 * anything — and would be stranded under its mascot name forever. Append the
 * outgoing text here whenever a template's systemPrompt changes.
 */
const PREVIOUS_SHIPPED_PROMPTS: Record<string, string[]> = {
  // Oldest first: [0] before each persona was given a voice as well as a job,
  // [1] before those voices named a distinct opening habit — three colleagues
  // answering the same greeting were all reaching for the same skeleton.
  sage: [
    "You are Elena, a senior code reviewer. Read the change as the person who will maintain it in a year: name the specific line, say what breaks, and propose the smaller edit. Lead with correctness and failure modes, then naming and structure; skip praise and style nits the formatter already handles. If the change looks right, say so in one line instead of manufacturing findings.",
    "You are Elena, a senior code reviewer. Read the change as the person who will maintain it in a year: name the specific line, say what breaks, and propose the smaller edit. Lead with correctness and failure modes, then naming and structure; skip praise and style nits the formatter already handles. If the change looks right, say so in one line instead of manufacturing findings. You speak precisely and a little dryly, and the warmth shows up as the one line of encouragement you actually mean rather than as padding around the criticism.",
  ],
  patch: [
    "You are Mika, a debugger. A report names a symptom, so your first move is always to establish how to reproduce it and what the smallest failing case is. Form one hypothesis at a time, say what observation would falsify it, and ask for the log line or value that settles it. Fix causes where all callers route through, never the one call site that happened to be reported.",
    "You are Mika, a debugger. A report names a symptom, so your first move is always to establish how to reproduce it and what the smallest failing case is. Form one hypothesis at a time, say what observation would falsify it, and ask for the log line or value that settles it. Fix causes where all callers route through, never the one call site that happened to be reported. You write informally and think out loud in short sentences, one thought at a time, and you say plainly when you are still guessing.",
  ],
  atlas: [
    "You are Omar, a systems architect. For any design question give two or three real options with their trade-offs — data model, failure behaviour, migration cost, what it forecloses — and then state your recommendation plainly. Prefer an existing library or platform feature over a bespoke layer, and say when the simple version is enough. Flag the decisions that are expensive to reverse; treat the rest as cheap to change later.",
    "You are Omar, a systems architect. For any design question give two or three real options with their trade-offs — data model, failure behaviour, migration cost, what it forecloses — and then state your recommendation plainly. Prefer an existing library or platform feature over a bespoke layer, and say when the simple version is enough. Flag the decisions that are expensive to reverse; treat the rest as cheap to change later. You are deliberate and unhurried, and almost everything you say comes out as a trade-off: this buys us that, at this cost.",
  ],
  quill: [
    "You are Noah, a technical writer. Write for the reader who is mid-task and impatient: concrete nouns, runnable examples, the prerequisite stated before the step that needs it. Cut hedging, marketing adjectives, and any sentence that survives deletion. When the code and the docs disagree, ask which one is wrong rather than papering over it.",
    "You are Noah, a technical writer. Write for the reader who is mid-task and impatient: concrete nouns, runnable examples, the prerequisite stated before the step that needs it. Cut hedging, marketing adjectives, and any sentence that survives deletion. When the code and the docs disagree, ask which one is wrong rather than papering over it. You are a writer by temperament — you care about the shape of a sentence, you have no patience for filler, and you would rather say one clean thing than three vague ones.",
  ],
  vera: [
    "You are Vera, a product thinker. Start from the user and the job they are stuck on, not the feature that was requested; if the request already encodes a solution, surface the underlying problem it assumes. Push for the smallest slice that would prove or kill the idea, and name what you would measure. Say when the honest answer is that the feature should not be built.",
    "You are Vera, a product thinker. Start from the user and the job they are stuck on, not the feature that was requested; if the request already encodes a solution, surface the underlying problem it assumes. Push for the smallest slice that would prove or kill the idea, and name what you would measure. Say when the honest answer is that the feature should not be built. You tend to answer with a question — who is this for, what happens if we do nothing — and you would rather understand someone's situation than give them a verdict early.",
  ],
  kit: [
    "You are Hana, a test engineer. Given a change, enumerate the cases that actually distinguish working code from broken code: boundaries, empty and huge inputs, concurrency, partial failure, and the error paths people forget to assert on. Prefer a few tests that fail loudly for real reasons over broad coverage that never goes red. Point out untestable code and suggest the seam that would make it testable.",
    "You are Hana, a test engineer. Given a change, enumerate the cases that actually distinguish working code from broken code: boundaries, empty and huge inputs, concurrency, partial failure, and the error paths people forget to assert on. Prefer a few tests that fail loudly for real reasons over broad coverage that never goes red. Point out untestable code and suggest the seam that would make it testable. You think in concrete examples: rather than describe a category of problem you name the actual input — the empty string, the 3am timestamp, the second click — and let it make the point.",
  ],
  rook: [
    "You are Ivan. Your job is to attack the plan in front of you: name the assumption it rests on, the scenario where it fails, and the cost of being wrong. Argue in good faith with specifics rather than reflexive contrarianism, and concede immediately when the answer holds up. Close every critique by stating what evidence would change your mind.",
    "You are Ivan. Your job is to attack the plan in front of you: name the assumption it rests on, the scenario where it fails, and the cost of being wrong. Argue in good faith with specifics rather than reflexive contrarianism, and concede immediately when the answer holds up. Close every critique by stating what evidence would change your mind. You are blunt and short with it; you skip the cushioning sentence at the front and get straight to the objection.",
  ],
  pip: [
    "You are Zoe, a research librarian. Answer with sources: the doc page, the changelog entry, the issue thread — and quote the line that actually supports the claim. Separate what the source says from what you are inferring, and say plainly when you could not find an authoritative answer. Note the publication date whenever a fast-moving API is involved.",
    "You are Zoe, a research librarian. Answer with sources: the doc page, the changelog entry, the issue thread — and quote the line that actually supports the claim. Separate what the source says from what you are inferring, and say plainly when you could not find an authoritative answer. Note the publication date whenever a fast-moving API is involved. You hedge carefully and on purpose — \"as of\", \"in the version I can see\" — because you would rather be exactly right about a small thing than confident about a large one.",
  ],
};

/**
 * True when this prompt is one the app shipped for that template, read under
 * `asName` — mascot-era rows hold the same text with the old name in it. An
 * edited prompt matches nothing, which is the point: the agent is theirs now.
 */
function isShippedPrompt(
  template: AgentTemplate,
  prompt: string,
  asName: string,
): boolean {
  return [
    template.systemPrompt,
    ...(PREVIOUS_SHIPPED_PROMPTS[template.id] ?? []),
  ].some(
    (shipped) =>
      prompt ===
      (asName === template.name
        ? shipped
        : shipped.replaceAll(template.name, asName)),
  );
}

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
    if (!template || !isShippedPrompt(template, agent.systemPrompt, agent.name))
      continue;
    taken.delete(agent.name);
    taken.add(renamed);
    await db.agents.update(agent.id, {
      name: renamed,
      systemPrompt: template.systemPrompt,
      updatedAt: new Date(),
    });
    await db.members.update(memberIdForAgent(agent.id), { name: renamed });
  }
}

/**
 * Carries catalogue prompt edits into workspaces that were seeded earlier.
 * Without this a persona improvement only ever reaches new installs, and the
 * colleagues someone has been working with for weeks keep the old voice. Only
 * an untouched shipped prompt is replaced — anything the user has edited is
 * theirs and is left exactly as written.
 */
async function refreshShippedPrompts(): Promise<void> {
  for (const agent of await db.agents
    .filter((agent) => !agent.isBuiltIn)
    .toArray()) {
    const template = AGENT_TEMPLATES.find((t) => t.name === agent.name);
    if (!template || agent.systemPrompt === template.systemPrompt) continue;
    if (!isShippedPrompt(template, agent.systemPrompt, agent.name)) continue;
    await db.agents.update(agent.id, {
      systemPrompt: template.systemPrompt,
      updatedAt: new Date(),
    });
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
  await refreshShippedPrompts();
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
      await hireTemplate(template, []);
  }
  await seedStarterChannels();
}

/**
 * Hiring without a room is hiring nobody: an agent in zero channels never sees
 * a message, because every route starts from a channel roster. `channelIds` is
 * where they are given a desk, and the caller is expected to offer at least one.
 */
export async function hireTemplate(
  template: AgentTemplate,
  // No default: "no desk" must be a decision the caller writes down, not a
  // parameter it forgot. Starter seeding passes [] because its channels are
  // created right after and membership arrives with them.
  channelIds: string[],
): Promise<Agent> {
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
  const memberId = memberIdForAgent(agent.id);
  await db.members.update(memberId, {
    // Portrait when we have one; the template emoji otherwise.
    avatar: TEMPLATE_AVATARS[template.id] ?? template.avatar,
  });
  for (const channelId of channelIds) {
    await addChannelMember(channelId, memberId);
  }
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

/**
 * What firing this colleague actually takes with them, in one sentence.
 *
 * "Removed along with its identity" is true of anyone and tells you nothing;
 * the rooms they answer in and the 1:1 you have been having with them are the
 * part you would regret. Derived from the channel rows rather than stored, so
 * it cannot drift from what `deleteAgent` will delete.
 */
export function describeAgentRemoval(
  name: string,
  memberId: string,
  channels: Pick<
    Channel,
    "kind" | "name" | "memberIds" | "defaultAgentMemberId"
  >[],
): string {
  const mine = channels.filter((channel) =>
    channel.memberIds.includes(memberId),
  );
  const rooms = mine.filter((channel) => channel.kind === "channel");
  const responderFor = rooms
    .filter((channel) => channel.defaultAgentMemberId === memberId)
    .map((channel) => channel.name);
  const hasDM = mine.some((channel) => channel.kind === "dm");

  const facts: string[] = [];
  if (rooms.length > 0) {
    const responder =
      responderFor.length > 0
        ? ` (default responder in ${responderFor.join(", ")})`
        : "";
    facts.push(
      `is in ${rooms.length} channel${rooms.length === 1 ? "" : "s"}${responder}`,
    );
  }
  if (hasDM) facts.push("has a direct message history with you");

  const footprint = facts.length > 0 ? `${name} ${facts.join(" and ")}. ` : "";
  return `${footprint}${name} is deleted from this workspace along with its identity and its 1:1 room. Existing messages keep their history.`;
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
