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
          // A colleague asking the room a question is asking the room. This
          // was closed when the hop ceiling was 3 and an open floor burned the
          // whole budget on one line; now the cap is generous and merely being
          // offered no longer books a slot, so a question posted by an agent
          // reaches the room exactly as a person's does. Without it "大家怎么样"
          // from an agent invited nobody and sat there unanswered, while the
          // same sentence from a person filled the room.
          openFloor: channel.kind === "channel",
          chain: agentHost.chain,
        });
        const mentionedAnyone =
          parseMentions(content, members).length > 0 || !!replyToMessageId;
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
            // The room being posted into, not the room the speaker was
            // standing in. These used to be the speaker's own frozen context,
            // which is right only while it talks where it was called: an agent
            // asked in a DM to raise something in #general handed the readers
            // a DM's message ids, and every one of their turns died on
            // "The frozen Agent Host context is not valid for this channel."
            contextMessageIds: [
              ...(
                await db.messages
                  .where("conversationId")
                  .equals(channel.conversationId)
                  .toArray()
              )
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
                .map((row) => row.id)
                .filter((id) => id !== messageId)
                .slice(-499),
              messageId,
            ],
            // Matches how the message was routed. A named colleague was asked
            // and a reply is expected of them; an open question was offered to
            // the room, where saying nothing is a complete answer. Reporting
            // an open floor as `direct` also armed the unheard-reply retry,
            // which re-asks a colleague who had quietly and correctly passed.
            mode: mentionedAnyone ? "direct" : "open-floor",
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
