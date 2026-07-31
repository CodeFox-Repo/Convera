/**
 * Display labels for the chat surface.
 *
 * Both answers are about identity — "who said this" and "who hears this" — so
 * neither may fall back to the product name. A message is always from someone.
 */

export interface SenderNameInput {
  /** Name of the resolved Member, when the message carries a senderId. */
  senderName?: string;
  isUser: boolean;
  /** Name of the agent this conversation is bound to. */
  agentName?: string | null;
}

export function resolveSenderName({
  senderName,
  isUser,
  agentName,
}: SenderNameInput): string {
  if (senderName) return senderName;
  if (isUser) return "You";
  return agentName || "Assistant";
}

export interface InputPlaceholderInput {
  /** Set when the current conversation is a channel. */
  channelName?: string | null;
  /** Agent bound to the current conversation, for a 1:1 chat. */
  agentName?: string | null;
}

export function composeInputPlaceholder({
  channelName,
  agentName,
}: InputPlaceholderInput): string {
  if (channelName) return `Message #${channelName}`;
  if (agentName) return `Message @${agentName}`;
  return "Message...";
}

/**
 * Roster line for an empty channel. Null when no agent is in the room yet —
 * there is nothing to mention, so saying so would only be noise.
 */
export function composeChannelAgentLine(agentNames: string[]): string | null {
  if (agentNames.length === 0) return null;
  const mentions = agentNames.map((name) => `@${name}`).join(", ");
  return `Agents here: ${mentions} — mention one to bring them in.`;
}
