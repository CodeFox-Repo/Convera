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
}

export interface ProjectOptions {
  /** Cap on total characters; oldest non-system messages drop first. */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 400_000;

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

export function projectFor(
  targetMemberId: string,
  messages: ProjectableMessage[],
  members: Member[],
  options: ProjectOptions = {},
): LocalAIMessage[] {
  const byId = new Map(members.map((member) => [member.id, member]));
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

    if (isSelf) {
      projected.push({ role: "assistant", content: message.content });
      continue;
    }

    const name = speakerName(message, byId);
    projected.push({
      role: "user",
      content: name ? `${name}: ${message.content}` : message.content,
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
export function buildChannelContext(
  self: Member,
  channelName: string,
  members: Member[],
  mayPass = false,
): string {
  const others = members
    .filter((member) => member.id !== self.id)
    .map((member) => `${member.name} (${member.kind})`);

  const lines = [
    `You are "${self.name}", a member of the team chat #${channelName}.`,
    others.length
      ? `Other participants: ${others.join(", ")}.`
      : "You are the only participant so far.",
    "Messages from others are prefixed with the speaker's name. Your own replies are not prefixed — do not prefix them.",
    // The role prompt describes what this person is good at, not a script they
    // must perform. Without this, "you are a code reviewer" turns a greeting
    // into an unprompted review checklist — the single loudest tell that an
    // agent is a costume rather than a colleague.
    "This is a chat room, not a task queue. Read what was actually said and respond to it the way a colleague would: match the length and register of the message, answer a greeting with a greeting, and stay quiet about your speciality until the conversation calls for it. Never open with a checklist, a template, or a description of your own process.",
  ];

  if (others.length) {
    lines.push("Mention someone with @Name to bring them into the thread.");
  }

  if (mayPass) {
    lines.push(
      `Nobody was addressed by name, so this message was offered to everyone in the room. Speak only if you actually have something to add: if someone else here is the better person to answer, or the message needs no reply from you, respond with exactly ${PASS_TOKEN} and nothing else. Passing is normal and costs nothing — a room where everyone answers every message is noise.`,
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
