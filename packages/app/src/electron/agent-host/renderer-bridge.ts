import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import type {
  AgentHostEvent,
  AgentHostRendererRequest,
  AgentHostRendererResponse,
} from "@/shared/types/agent-host";
import { AGENT_HOST_CHANNELS } from "@/electro-bridge/ipc/agent-host-api";

type RendererRequestInput = AgentHostRendererRequest extends infer Request
  ? Request extends { id: string }
    ? Omit<Request, "id">
    : never
  : never;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

export class AgentHostRendererBridge {
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly getRenderer: () => WebContents | null | undefined,
    private readonly timeoutMs = 30_000,
  ) {}

  async request<T>(input: RendererRequestInput): Promise<T> {
    const renderer = this.getRenderer();
    if (!renderer || renderer.isDestroyed()) {
      throw new Error(
        "The Convera renderer is unavailable; background agent work cannot access its channel.",
      );
    }
    const request = {
      ...input,
      id: randomUUID(),
    } as AgentHostRendererRequest;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.id);
        reject(
          new Error(
            `The renderer did not answer Agent Host request ${request.kind}.`,
          ),
        );
      }, this.timeoutMs);
      this.pending.set(request.id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
      renderer.send(AGENT_HOST_CHANNELS.REQUEST, request);
    });
  }

  respond(response: AgentHostRendererResponse): boolean {
    const pending = this.pending.get(response.requestId);
    if (!pending) return false;
    this.pending.delete(response.requestId);
    clearTimeout(pending.timeout);
    if (response.success) pending.resolve(response.data);
    else
      pending.reject(
        new Error(
          response.error || "The renderer rejected an Agent Host request.",
        ),
      );
    return true;
  }

  emit(event: AgentHostEvent): void {
    const renderer = this.getRenderer();
    if (!renderer || renderer.isDestroyed()) return;
    renderer.send(AGENT_HOST_CHANNELS.EVENT, event);
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Agent Host renderer bridge stopped."));
    }
    this.pending.clear();
  }
}
