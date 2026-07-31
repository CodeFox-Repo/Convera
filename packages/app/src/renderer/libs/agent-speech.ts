import { addMessage, db, type Channel } from "./db";
import { registerWorkspaceSendMessage } from "./workspace-perception";
import type { WorkspaceQueryResult } from "@/shared/types/workspace-perception";
import { parseMentions } from "./mention-parser";
import { routeMessage } from "./agent-routing";
import { dispatchAgentHostOffers } from "./agent-host-service";
import type { Member } from "@/shared/types/workspace";

/**
 * Speaking, as an agent does it.
 *
 * The platform used to allocate a reply slot before the agent had decided
 * anything: an empty bubble appeared, the model filled it, and declining to
 * speak meant deleting a row that should never have existed. Here the message
 * only exists because the agent called the tool, so silence is simply the
 * absence of a call — nothing to place, nothing to clean up, and the order of
 * a room is whoever actually spoke rather than whoever the router listed.
 *
 * Visibility is already enforced upstream in `resolveWorkspaceQuery`, which
 * refuses a channel the sender cannot see before this ever runs.
 */
async function speak(
  channel: Channel,
  senderId: string,
  content: string,
  replyToMessageId?: string,
): Promise<string> {
  const members = await db.members.toArray();
  return addMessage(channel.conversationId, {
    role: "assistant",
    content,
    senderId,
    // Parsed here rather than trusted from the model: a mention is what routes
    // the next turn, so it has to reflect the text that was actually posted.
    mentions: parseMentions(content, members),
    ...(replyToMessageId ? { replyToMessageId } : {}),
    status: "completed",
  });
}

/**
 * Wires agent speech into the workspace tool seam. Called once at startup;
 * without it `send_message` reports itself unavailable and the agent stays mute
 * rather than the turn failing.
 */
export function installAgentSpeech(): void {
  registerWorkspaceSendMessage(
    async ({
      viewerMemberId,
      channelId,
      content,
      replyToMessageId,
      agentHost,
    }): Promise<WorkspaceQueryResult> => {
      const channel = await db.channels.get(channelId);
      if (!channel) {
        return {
          ok: false,
          error: {
            code: "CHANNEL_NOT_VISIBLE",
            message: `No channel ${channelId} is visible to you.`,
          },
        };
      }
      const messageId = await speak(
        channel,
        viewerMemberId,
        content,
        replyToMessageId,
      );
      if (agentHost) {
        const memberRows = await db.members.bulkGet(channel.memberIds);
        const members = memberRows.filter(
          (member): member is Member => member !== undefined,
        );
        const routed = routeMessage({
          message: { senderId: viewerMemberId, content },
          members,
          replyToSenderId: replyToMessageId
            ? (await db.messages.get(replyToMessageId))?.senderId
            : undefined,
          defaultAgentMemberId: null,
          openFloor: false,
          chain: agentHost.chain,
        });
        if (routed.invoke.length > 0) {
          const targets = routed.invoke.flatMap((memberId) => {
            const member = members.find(
              (candidate) => candidate.id === memberId,
            );
            return member?.agentId
              ? [{ agentId: member.agentId, memberId }]
              : [];
          });
          await dispatchAgentHostOffers({
            channelId: channel.id,
            channelKind: channel.kind,
            conversationId: channel.conversationId,
            triggerMessageId: messageId,
            contextMessageIds: [
              ...agentHost.contextMessageIds.slice(-499),
              messageId,
            ],
            mode: "direct",
            offeredAgentMemberIds: routed.invoke,
            targets,
            chain: routed.chain,
          });
        }
      }
      return {
        ok: true,
        kind: "send_message",
        messageId,
      };
    },
  );
}
