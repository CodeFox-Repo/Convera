import type {
  AgentHostEvent,
  AgentHostJob,
  PreparedAgentHostTurn,
} from "@/shared/types/agent-host";
import type { LocalAIRuntimeService } from "@/shared/types/local-ai";
import type { AgentHostExecutor } from "./host";
import type { AgentHostRendererBridge } from "./renderer-bridge";

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
        agent: {
          ...prepared.request.agent,
          id: job.agentId,
          memberId: job.agentMemberId,
        },
      };
      this.activeRequests.set(job.id, request.requestId);
      await this.runtime.startChat(request, (event) => {
        emit({ type: "stream", jobId: job.id, event });
      });
    } finally {
      this.activeRequests.delete(job.id);
    }
  }

  async cancel(job: AgentHostJob): Promise<boolean> {
    const requestId = this.activeRequests.get(job.id);
    if (!requestId) return true;
    return await this.runtime.abort(requestId);
  }
}
