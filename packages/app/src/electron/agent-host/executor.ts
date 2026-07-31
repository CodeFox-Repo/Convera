import type {
  AgentHostEvent,
  AgentHostJob,
  PreparedAgentHostTurn,
  SettledAgentHostTurn,
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
  ): Promise<SettledAgentHostTurn> {
    await this.bridge.request({
      kind: "set-member-status",
      memberId: job.agentMemberId,
      status: "working",
    });
    try {
      const prepared = await this.bridge.request<PreparedAgentHostTurn>({
        kind: "prepare-turn",
        job,
      });
      this.activeRequests.set(job.id, prepared.request.requestId);
      await this.runtime.startChat(prepared.request, (event) => {
        emit({ type: "stream", jobId: job.id, event });
      });
      return await this.bridge.request<SettledAgentHostTurn>({
        kind: "settle-turn",
        job: {
          ...job,
          requestId: prepared.request.requestId,
          turnId: prepared.request.turnId,
        },
      });
    } finally {
      this.activeRequests.delete(job.id);
      await this.bridge
        .request({
          kind: "set-member-status",
          memberId: job.agentMemberId,
          status: "idle",
        })
        .catch(() => undefined);
    }
  }

  async cancel(job: AgentHostJob): Promise<boolean> {
    const requestId = this.activeRequests.get(job.id);
    if (!requestId) return true;
    return await this.runtime.abort(requestId);
  }
}
