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
): string {
  const others = members
    .filter((member) => member.id !== self.id)
    .map((member) => `${member.name} (${member.kind})`);

  const lines = [
    `You are "${self.name}" in the channel #${channelName}.`,
    others.length
      ? `Other participants: ${others.join(", ")}.`
      : "You are the only participant so far.",
    "Messages from others are prefixed with the speaker's name. Your own replies are not prefixed — do not prefix them.",
  ];

  if (others.length) {
    lines.push("Mention someone with @Name to bring them into the thread.");
  }

  return lines.join("\n");
}
