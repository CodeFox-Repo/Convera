import type { LocalAIMessage } from "@/shared/types/local-ai";
import type { Member } from "@/shared/types/workspace";

/**
 * Projects one channel transcript into a single agent's point of view.
 *
 * A channel holds one public transcript, but each agent must receive a private
 * conversation in which it is the assistant. The direction matters more than it
 * looks: if an agent's own past replies arrive as `user`, the model reads them
 * as someone else's words and starts continuing them — the failure shows up as
 * "the agent has no consistent persona", not as an error.
 *
 *   speaker is the target agent  -> assistant, no prefix (its own output)
 *   anyone else (human OR agent) -> user, prefixed "Name: " (input to it)
 */

export interface ProjectableMessage {
  id?: string;
  senderId?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  replyToMessageId?: string;
}

export interface ProjectOptions {
  /** Cap on total characters; oldest non-system messages drop first. */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 400_000;
const REPLY_EXCERPT_MAX_CHARS = 240;

function speakerName(
  message: ProjectableMessage,
  members: Map<string, Member>,
): string | undefined {
  if (!message.senderId) {
    // Pre-multi-agent history has no senderId; role is the only signal.
    return message.role === "assistant" ? undefined : "User";
  }
  return members.get(message.senderId)?.name;
}

function replyContext(
  message: ProjectableMessage,
  messagesById: Map<string, ProjectableMessage>,
  members: Map<string, Member>,
): string | undefined {
  if (!message.replyToMessageId) return undefined;
  const parent = messagesById.get(message.replyToMessageId);
  if (!parent) {
    return `[Replying to unavailable message (${message.replyToMessageId})]`;
  }

  const author = speakerName(parent, members) ?? "Assistant";
  const normalized = parent.content.replace(/\s+/g, " ").trim();
  const excerpt =
    normalized.length > REPLY_EXCERPT_MAX_CHARS
      ? `${normalized.slice(0, REPLY_EXCERPT_MAX_CHARS)}…`
      : normalized || "(no text)";
  return `[Replying to ${author} (${message.replyToMessageId}): ${JSON.stringify(excerpt)}]`;
}

function projectedContent(
  message: ProjectableMessage,
  messagesById: Map<string, ProjectableMessage>,
  members: Map<string, Member>,
): string {
  const context = replyContext(message, messagesById, members);
  return context ? `${context}\n${message.content}` : message.content;
}

export function projectFor(
  targetMemberId: string,
  messages: ProjectableMessage[],
  members: Member[],
  options: ProjectOptions = {},
): LocalAIMessage[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  const messagesById = new Map<string, ProjectableMessage>();
  for (const message of messages) {
    if (message.id) messagesById.set(message.id, message);
  }
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

  const projected: LocalAIMessage[] = [];

  for (const message of messages) {
    // Tool traffic belongs to whoever produced it and is not shared context.
    if (message.role === "tool") continue;

    if (message.role === "system") {
      projected.push({ role: "system", content: message.content });
      continue;
    }

    const isSelf = message.senderId
      ? message.senderId === targetMemberId
      : message.role === "assistant";
    const content = projectedContent(message, messagesById, byId);

    if (isSelf) {
      projected.push({ role: "assistant", content });
      continue;
    }

    const name = speakerName(message, byId);
    projected.push({
      role: "user",
      content: name ? `${name}: ${content}` : content,
    });
  }

  return truncateToBudget(projected, maxChars);
}

/**
 * Projects one open-floor offer for everyone it was offered to, at once.
 *
 * The turns still commit one at a time — the runtime serializes per
 * conversation and only one turn may be pending — so the colleague invoked
 * second would otherwise be handed a transcript that already contains the
 * first one's answer. Models agree with what is in the window, and three
 * agents answer one question with the same sentence. Projecting the batch up
 * front makes "everyone judges the same room" structural rather than a rule
 * each call site has to remember.
 */
export function projectOpenFloor(
  targetMemberIds: string[],
  messages: ProjectableMessage[],
  members: Member[],
  options: ProjectOptions = {},
): Map<string, LocalAIMessage[]> {
  return new Map(
    targetMemberIds.map((id) => [
      id,
      projectFor(id, messages, members, options),
    ]),
  );
}

/**
 * Drops the oldest non-system messages until the transcript fits.
 *
 * System messages carry the agent's identity and are never dropped; losing them
 * would change who the agent is rather than merely what it remembers.
 */
function truncateToBudget(
  messages: LocalAIMessage[],
  maxChars: number,
): LocalAIMessage[] {
  let total = messages.reduce(
    (sum, message) => sum + message.content.length,
    0,
  );
  if (total <= maxChars) return messages;

  const kept = [...messages];
  for (let index = 0; index < kept.length && total > maxChars; ) {
    if (kept[index].role === "system") {
      index += 1;
      continue;
    }
    total -= kept[index].content.length;
    kept.splice(index, 1);
  }
  return kept;
}

/**
 * The channel context appended to an agent's own system prompt.
 *
 * Without it the agent treats the "Name: " prefixes as part of the message body
 * and has no idea that @-mentioning a peer is an available move.
 */
/**
 * A colleague who was offered the same message. The description is what makes
 * "closer to their work than mine" answerable — a bare name says nothing about
 * who writes the docs.
 */
export interface OfferedPeer {
  id: string;
  name: string;
  description?: string;
}

export function buildChannelContext(
  self: Member,
  channelName: string,
  members: Member[],
  mayPass = false,
  /**
   * Who else received this same message. An agent that only knows it was asked
   * concludes it should answer — three colleagues each reasoned that way and
   * posted the same sentence. A person in a room can see the question went to
   * everyone, and that is what makes "someone else is better placed" a judgement
   * they can actually make.
   */
  alsoOffered: OfferedPeer[] = [],
  /** Needed to call send_message — the name alone is not addressable. */
  channelId?: string,
): string {
  const others = members
    .filter((member) => member.id !== self.id)
    .map((member) => `${member.name} (${member.kind})`);

  const lines = [
    // Where they work, not what role they are performing. A colleague knows
    // the name of their workplace and their own id in it the way anyone knows
    // their desk — it is context, not a costume.
    channelId
      ? `You work at this organisation. This is the chat software your team uses, and you are "${self.name}" (member id: ${self.id}). You are currently in #${channelName} (channel_id: ${channelId}).`
      : `You work at this organisation. This is the chat software your team uses, and you are "${self.name}". You are currently in #${channelName}.`,
    others.length
      ? `In this room with you: ${others.join(", ")}.`
      : "You are the only one in this room so far.",
    "Messages from others are prefixed with the speaker's name. Your own are not — do not prefix them.",
    // Where the agent's words come out differs by caller, and telling it the
    // wrong one costs the whole reply. A channel shows only what
    // `send_message` posted, so answering into turn output is answering into
    // the void. A 1:1 has no channel to post into: its turn output *is* the
    // reply, and instructing it to reach for a tool it cannot address left
    // the user looking at an empty bubble. `channelId` is what tells them
    // apart — the agent host passes one, the 1:1 path has none to pass.
    channelId
      ? `You have a send_message tool. It is how this chat software posts to a channel — the way clicking Send works for the people here. Think of your own reply text as thinking to yourself: useful to you, but it never reaches the room. Only what you pass to send_message (channel_id "${channelId}") appears on screen. So when you have decided to say something, say it by calling send_message; when you have decided you have nothing worth adding, just end your turn. Both are normal.`
      : "This is a direct conversation: what you write as your answer is what the other person reads. Just reply.",
    "This is a chat room, not a task queue. Read what was actually said and reply the way a colleague would: match the length and register of the message, answer a greeting with a greeting, and stay quiet about your speciality until the conversation calls for it. Never open with a checklist, a template, or a description of your own process.",
  ];

  if (others.length) {
    lines.push("Mention someone with @Name to bring them into the thread.");
  }

  if (mayPass) {
    const peers = alsoOffered.filter((member) => member.id !== self.id);
    lines.push(
      peers.length
        ? `Nobody was addressed by name. This same message went to ${peers
            .map((peer) =>
              peer.description
                ? `${peer.name} (${peer.description})`
                : peer.name,
            )
            .join(
              "; ",
            )} at the same time as you — each deciding alone. Answer if you have something to say: a greeting back, an opinion, your take on the question. Several of you answering the same friendly message is fine — that is what a room sounds like. Stay quiet only when the message clearly belongs to one colleague's specific work, or when you truly have nothing to add.`
        : "Nobody was addressed by name, so this message is yours to answer or leave. Speak only if you have something to add; a room where every message gets a reply is noise.",
    );
  }

  return lines.join("\n");
}

/**
 * How an agent declines a turn it was offered. Chosen to be something no
 * genuine reply would ever start with, so the check can stay a prefix test.
 */
export const PASS_TOKEN = "[pass]";

/** True when a reply is the agent choosing to stay silent. */
export function isPass(text: string): boolean {
  return text.trim().toLowerCase().startsWith(PASS_TOKEN);
}
