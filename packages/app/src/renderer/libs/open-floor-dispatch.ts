import type { LocalAIMessage } from "@/shared/types/local-ai";
import type { LocalAIProviderId } from "./local-ai";
import { getLocalAI } from "./local-ai";
import { useTypingStore } from "./stores/typing-store";
import { WORKSPACE_SEND_MESSAGE_TOOL } from "@/shared/types/workspace-perception";

/**
 * Runs an open floor: every colleague offered the message thinks at the same
 * time, and each one speaks — or does not — through `send_message`.
 *
 * These turns deliberately bypass the single-request chat hook. That hook exists
 * to own one reply row: it stages a shell, streams into it, and reconciles it.
 * None of that applies here, because a colleague who was merely offered the
 * floor reserves nothing and may say nothing at all. Sharing the hook would
 * have meant queueing them one behind another, which is exactly the "they take
 * turns" behaviour this replaces — a room where three people were asked does
 * not make them answer in series.
 *
 * Nothing is written from here. `send_message` posts through the workspace tool
 * seam, so the transcript is only ever touched by an agent that chose to speak.
 */
export interface OpenFloorTurn {
  memberId: string;
  agentId: string;
  systemPrompt: string;
  providerId: LocalAIProviderId;
  modelId?: string;
  requestMessages: LocalAIMessage[];
  conversationId: string;
  cwd?: string;
}

export interface OpenFloorResult {
  memberId: string;
  spoke: boolean;
  error?: string;
}

function runOne(turn: OpenFloorTurn): Promise<OpenFloorResult> {
  const localAI = getLocalAI();
  if (!localAI) {
    return Promise.resolve({
      memberId: turn.memberId,
      spoke: false,
      error: "Local AI runtime is not available.",
    });
  }

  const requestId = crypto.randomUUID();
  const typing = useTypingStore.getState();

  return new Promise<OpenFloorResult>((resolve) => {
    let spoke = false;
    let settled = false;
    const finish = (result: OpenFloorResult) => {
      if (settled) return;
      settled = true;
      typing.stopTyping(requestId);
      unsubscribe();
      resolve(result);
    };

    const unsubscribe = localAI.onEvent(requestId, (event) => {
      if (event.type === "ui-message") {
        const chunk = event.chunk as { type?: string; toolName?: string };
        // Reaching for the speech tool is the only honest moment to say
        // someone is typing: it is the agent committing to speak.
        if (
          chunk.type === "tool-input-start" &&
          chunk.toolName?.endsWith(WORKSPACE_SEND_MESSAGE_TOOL)
        ) {
          spoke = true;
          typing.startTyping(requestId, turn.memberId);
        }
        return;
      }
      if (event.type === "error") {
        finish({
          memberId: turn.memberId,
          spoke,
          error: event.error.message,
        });
        return;
      }
      if (event.type === "finish") {
        finish({ memberId: turn.memberId, spoke });
      }
    });

    void localAI
      .startChat({
        requestId,
        conversationId: turn.conversationId,
        turnId: crypto.randomUUID(),
        providerId: turn.providerId,
        modelId: turn.modelId,
        concurrent: true,
        operation: { kind: "bootstrap", messages: turn.requestMessages },
        agent: {
          id: turn.agentId,
          memberId: turn.memberId,
          systemPrompt: turn.systemPrompt,
        },
        ...(turn.cwd ? { options: { cwd: turn.cwd } } : {}),
      })
      .then((result) => {
        if (!result.success || !result.accepted) {
          finish({
            memberId: turn.memberId,
            spoke: false,
            error: result.error?.message ?? "The runtime rejected the turn.",
          });
        }
      })
      .catch((error: unknown) =>
        finish({
          memberId: turn.memberId,
          spoke: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  });
}

/** One agent failing is that agent staying quiet, not the room going down. */
export function dispatchOpenFloor(
  turns: OpenFloorTurn[],
): Promise<OpenFloorResult[]> {
  return Promise.all(turns.map(runOne));
}
