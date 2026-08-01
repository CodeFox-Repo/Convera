import { randomUUID } from "node:crypto";
import type {
  AgentHostEvent,
  AgentHostJob,
  PreparedAgentHostTurn,
} from "@/shared/types/agent-host";
import type {
  LocalAIChatRequest,
  LocalAIRuntimeService,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import { WORKSPACE_QUERY_INTERACTION } from "@/shared/types/workspace-perception";
import type { AgentHostExecutor } from "./host";
import type { AgentHostRendererBridge } from "./renderer-bridge";

/**
 * A turn that ends without calling the speech tool said nothing at all: the
 * model wrote a perfectly good reply into its own turn output, which nobody
 * can read. Measured at roughly one direct offer in five on every provider
 * tried, so it is a fact about models rather than a prompt bug — telling the
 * agent it was not heard is cheaper than failing the job in the user's face.
 */
export const UNHEARD_REMINDER =
  "[Convera] Your last turn ended without calling send_message, so nothing you wrote reached the channel and nobody heard you. You were addressed directly, so a reply is expected: say it by calling send_message with the channel_id.";

function isSpeech(event: LocalAIStreamEvent): boolean {
  return (
    event.type === "interaction" &&
    event.name === WORKSPACE_QUERY_INTERACTION &&
    typeof event.input === "object" &&
    event.input !== null &&
    "kind" in event.input &&
    event.input.kind === "send_message"
  );
}

/**
 * The same turn again, with the reminder appended.
 *
 * Deliberately keeps `requestId`: the renderer routes tool round trips and the
 * typing indicator by it, and the finished turn has already released it. The
 * turn id must be new (ids are unique) and the operation must be a rebase —
 * only a rebase may reset a session whose transcript the first turn advanced.
 */
function remind(request: LocalAIChatRequest): LocalAIChatRequest {
  const messages =
    request.operation.kind === "append"
      ? (request.operation.recoveryMessages ?? [request.operation.message])
      : request.operation.messages;
  return {
    ...request,
    turnId: randomUUID(),
    operation: {
      kind: "rebase",
      reason: "regenerate",
      messages: [...messages, { role: "user", content: UNHEARD_REMINDER }],
    },
  };
}

export class LocalAiAgentHostExecutor implements AgentHostExecutor {
  private readonly activeRequests = new Map<string, string>();

  constructor(
    private readonly runtime: LocalAIRuntimeService,
    private readonly bridge: AgentHostRendererBridge,
  ) {}

  async execute(
    job: AgentHostJob,
    emit: (event: AgentHostEvent) => void,
  ): Promise<void> {
    try {
      const prepared = await this.bridge.request<PreparedAgentHostTurn>({
        kind: "prepare-turn",
        job,
      });
      const request = {
        ...prepared.request,
        conversationId: job.conversationId,
        concurrent: true,
        agentHost: {
          jobId: job.id,
          taskId: job.taskId,
          channelKind: job.channelKind,
        },
        agent: {
          ...prepared.request.agent,
          id: job.agentId,
          memberId: job.agentMemberId,
        },
      };
      this.activeRequests.set(job.id, request.requestId);
      if (await this.runTurn(request, job, emit)) return;
      // Silence is a complete answer on an open floor; only a direct question
      // left unanswered is worth a second ask.
      if (job.mode !== "direct") return;
      if (await this.runTurn(remind(request), job, emit)) return;
      throw new Error(
        "The agent completed a direct offer without sending a message.",
      );
    } finally {
      this.activeRequests.delete(job.id);
    }
  }

  /** Runs one turn; resolves to whether the agent actually spoke. */
  private async runTurn(
    request: LocalAIChatRequest,
    job: AgentHostJob,
    emit: (event: AgentHostEvent) => void,
  ): Promise<boolean> {
    let streamError: Error | undefined;
    let spoke = false;
    await this.runtime.startChat(request, (event) => {
      if (event.type === "error") {
        streamError = new Error(event.error.message);
      }
      if (isSpeech(event)) spoke = true;
      emit({ type: "stream", jobId: job.id, event });
    });
    if (streamError) throw streamError;
    return spoke;
  }

  async cancel(job: AgentHostJob): Promise<boolean> {
    const requestId = this.activeRequests.get(job.id);
    if (!requestId) return true;
    return await this.runtime.abort(requestId);
  }
}
