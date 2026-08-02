import type { AgentHostEvent, AgentHostJob } from "@/shared/types/agent-host";
import type {
  LocalAIChatRequest,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import type {
  TraceAttributes,
  TraceEventInput,
  TraceSpan,
  TraceStatus,
} from "@/shared/types/trace";
import { WORKSPACE_QUERY_INTERACTION } from "@/shared/types/workspace-perception";
import type { TraceEventSink, TraceEventStore } from "./store";

/**
 * Forward-compatible view of the structured collaboration provenance added by
 * PR #218. Keeping this local means tracing can land independently and starts
 * recording the extra fields as soon as that AgentHost shape is present.
 */
interface StructuredCollaboration {
  kind: "delegation" | "handoff";
  operationId: string;
  sourceTaskId: string;
  sourceJobId: string;
  fromMemberId: string;
  depth: number;
  path: string[];
  expiresAt?: string;
}

type TraceableAgentHostJob = AgentHostJob & {
  parentTaskId?: string;
  collaboration?: StructuredCollaboration;
  outputMessageIds?: string[];
};

function structuredJob(job: AgentHostJob): TraceableAgentHostJob {
  return job as TraceableAgentHostJob;
}

function traceIdFor(job: AgentHostJob): string {
  return `trace:${job.triggerMessageId}`;
}

function missionSpanId(job: AgentHostJob): string {
  return `mission:${job.triggerMessageId}`;
}

function taskSpanId(job: AgentHostJob): string {
  return `task:${job.taskId}`;
}

function runSpanId(job: AgentHostJob): string {
  return `run:${job.id}`;
}

function collaborationAttributes(job: TraceableAgentHostJob): TraceAttributes {
  const collaboration = job.collaboration;
  return collaboration
    ? {
        collaborationKind: collaboration.kind,
        collaborationOperationId: collaboration.operationId,
        sourceTaskId: collaboration.sourceTaskId,
        sourceJobId: collaboration.sourceJobId,
        fromMemberId: collaboration.fromMemberId,
        taskDepth: collaboration.depth,
      }
    : {};
}

function terminalStatus(job: AgentHostJob): TraceStatus | undefined {
  if (job.status === "completed") return "ok";
  if (job.status === "failed") return "error";
  if (job.status === "cancelled") return "cancelled";
  if (job.status === "interrupted") return "interrupted";
  if (job.status === "uncertain") return "interrupted";
  return undefined;
}

function toolNameOf(chunk: unknown): string | undefined {
  const name = (chunk as { toolName?: string }).toolName;
  return typeof name === "string" ? name.replace(/^workspace:/, "") : undefined;
}

export class AgentHostTraceRecorder {
  constructor(
    private readonly sink: TraceEventStore,
    private readonly options: {
      now?: () => Date;
      onError?: (error: unknown) => void;
    } = {},
  ) {}

  async record(event: AgentHostEvent): Promise<void> {
    if (event.type === "job") await this.recordJob(event.job);
  }

  async recordJob(job: AgentHostJob): Promise<void> {
    const traceable = structuredJob(job);
    const collaboration = traceable.collaboration;
    const traceId = traceIdFor(job);
    const missionId = missionSpanId(job);
    const taskId = taskSpanId(job);
    const runId = runSpanId(job);
    const taskParentId = traceable.parentTaskId
      ? `task:${traceable.parentTaskId}`
      : missionId;
    const handoffId =
      collaboration?.kind === "handoff"
        ? `handoff:${collaboration.operationId}`
        : undefined;
    const common = {
      traceId,
      emitter: "main" as const,
      classification: "P0" as const,
    };
    const inputs: TraceEventInput[] = [
      {
        ...common,
        eventId: `${missionId}:start`,
        spanId: missionId,
        occurredAt: job.createdAt,
        type: "span.start",
        spanKind: "mission",
        name: "Agent collaboration mission",
        attributes: {
          conversationId: job.conversationId,
          channelId: job.channelId,
          triggerMessageId: job.triggerMessageId,
          mode: job.mode,
        },
      },
      {
        ...common,
        eventId: `${taskId}:start`,
        spanId: taskId,
        parentSpanId: taskParentId,
        links:
          collaboration?.kind === "delegation"
            ? [
                {
                  spanId: `run:${collaboration.sourceJobId}`,
                  relation: "triggered_by",
                },
              ]
            : undefined,
        occurredAt: job.createdAt,
        type: "span.start",
        spanKind: "task",
        name: "Agent task",
        attributes: {
          taskId: job.taskId,
          agentId: job.agentId,
          agentMemberId: job.agentMemberId,
          ...(traceable.parentTaskId
            ? { parentTaskId: traceable.parentTaskId }
            : {}),
          ...collaborationAttributes(traceable),
        },
      },
      {
        ...common,
        eventId: `${runId}:start`,
        spanId: runId,
        parentSpanId: taskId,
        links: [
          ...(job.parentJobId
            ? [
                {
                  spanId: `run:${job.parentJobId}`,
                  relation: "supersedes" as const,
                },
              ]
            : []),
          ...(handoffId
            ? [{ spanId: handoffId, relation: "triggered_by" as const }]
            : []),
        ],
        occurredAt: job.createdAt,
        type: "span.start",
        spanKind: "run",
        name: "Agent run",
        attributes: {
          runId: job.id,
          attempt: job.attempts,
          jobStatus: job.status,
          agentMemberId: job.agentMemberId,
          ...collaborationAttributes(traceable),
        },
      },
    ];
    if (handoffId && collaboration) {
      inputs.push(
        {
          ...common,
          eventId: `${handoffId}:start`,
          spanId: handoffId,
          parentSpanId: taskId,
          links: [
            {
              spanId: `run:${collaboration.sourceJobId}`,
              relation: "handoff",
            },
          ],
          occurredAt: job.createdAt,
          type: "span.start",
          spanKind: "handoff",
          name: "Task ownership handoff",
          attributes: {
            operationId: collaboration.operationId,
            taskId: job.taskId,
            sourceJobId: collaboration.sourceJobId,
            fromMemberId: collaboration.fromMemberId,
            toMemberId: job.agentMemberId,
            taskDepth: collaboration.depth,
          },
        },
        {
          ...common,
          eventId: `${handoffId}:end`,
          spanId: handoffId,
          parentSpanId: taskId,
          occurredAt: job.createdAt,
          type: "span.end",
          spanKind: "handoff",
          name: "Task ownership handoff",
          status: "ok",
          attributes: { committed: true },
        },
      );
    }
    const status = terminalStatus(job);
    inputs.push({
      ...common,
      eventId: `${taskId}:status:${job.status}:${job.updatedAt}`,
      spanId: taskId,
      parentSpanId: taskParentId,
      occurredAt: job.updatedAt,
      type: "span.event",
      spanKind: "task",
      name: "Task status changed",
      status,
      attributes: {
        jobStatus: job.status,
        currentRunId: job.id,
        resultMessageCount: traceable.outputMessageIds?.length ?? 0,
        ...collaborationAttributes(traceable),
      },
    });
    inputs.push({
      ...common,
      eventId: `${runId}:${status ? "end" : "status"}:${job.status}:${job.updatedAt}`,
      spanId: runId,
      parentSpanId: taskId,
      occurredAt: job.completedAt ?? job.updatedAt,
      type: status ? "span.end" : "span.event",
      spanKind: "run",
      name: status ? "Agent run ended" : "Run status changed",
      status,
      attributes: {
        jobStatus: job.status,
        attempt: job.attempts,
        ...(job.error ? { errorType: "agent-run-error" } : {}),
      },
    });
    await this.safeAppend(inputs);
    if (job.status === "interrupted" || job.status === "uncertain") {
      await this.recoverInterruptedRun(job);
    }
  }

  async beginTurn(
    job: AgentHostJob,
    request: LocalAIChatRequest,
    previousTurnId?: string,
  ): Promise<AgentTurnTrace> {
    await this.recordJob(job);
    const turn = new AgentTurnTrace(this.sink, job, request, {
      now: this.options.now,
      onError: this.options.onError,
      previousTurnId,
    });
    await turn.start();
    return turn;
  }

  private async safeAppend(input: TraceEventInput[]): Promise<void> {
    try {
      await this.sink.append(input);
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  private async recoverInterruptedRun(job: AgentHostJob): Promise<void> {
    try {
      const traceId = traceIdFor(job);
      const runId = runSpanId(job);
      const graph = await this.sink.graph(traceId);
      const children = new Map<string, TraceSpan[]>();
      for (const span of graph.spans) {
        if (!span.parentSpanId) continue;
        const siblings = children.get(span.parentSpanId);
        if (siblings) siblings.push(span);
        else children.set(span.parentSpanId, [span]);
      }
      const descendants: Array<{ span: TraceSpan; depth: number }> = [];
      const visit = (parentSpanId: string, depth: number) => {
        for (const span of children.get(parentSpanId) ?? []) {
          descendants.push({ span, depth });
          visit(span.spanId, depth + 1);
        }
      };
      visit(runId, 1);
      const occurredAt = job.completedAt ?? job.updatedAt;
      const inputs = descendants
        .filter(
          ({ span }) =>
            !span.endedAt && ["turn", "model", "tool"].includes(span.spanKind),
        )
        .sort((left, right) => right.depth - left.depth)
        .map(
          ({ span }): TraceEventInput => ({
            eventId: `${span.spanId}:recovered:interrupted`,
            traceId,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
            occurredAt,
            emitter: "main",
            type: "span.end",
            spanKind: span.spanKind,
            name: span.name,
            status: "interrupted",
            attributes: { recoveredAfterRestart: true },
            classification: "P0",
          }),
        );
      if (inputs.length > 0) await this.safeAppend(inputs);
    } catch (error) {
      this.options.onError?.(error);
    }
  }
}

export class AgentTurnTrace {
  private readonly writes: Promise<void>[] = [];
  private readonly traceId: string;
  private readonly runId: string;
  private readonly turnId: string;
  private readonly modelId: string;
  private readonly startedAt: string;
  private readonly toolNames = new Map<string, string>();
  private ended = false;
  private spoke = false;

  constructor(
    private readonly sink: TraceEventSink,
    job: AgentHostJob,
    private readonly request: LocalAIChatRequest,
    private readonly options: {
      now?: () => Date;
      onError?: (error: unknown) => void;
      previousTurnId?: string;
    } = {},
  ) {
    this.traceId = traceIdFor(job);
    this.runId = runSpanId(job);
    this.turnId = `turn:${request.turnId}`;
    this.modelId = `model:${request.turnId}`;
    this.startedAt = this.now();
  }

  async start(): Promise<void> {
    await this.safeAppend([
      {
        eventId: `${this.turnId}:start`,
        traceId: this.traceId,
        spanId: this.turnId,
        parentSpanId: this.runId,
        links: this.options.previousTurnId
          ? [
              {
                spanId: `turn:${this.options.previousTurnId}`,
                relation: "supersedes",
              },
            ]
          : undefined,
        occurredAt: this.startedAt,
        emitter: "main",
        type: "span.start",
        spanKind: "turn",
        name: "Agent turn",
        attributes: {
          turnId: this.request.turnId,
          requestId: this.request.requestId,
          operation: this.request.operation.kind,
          conversationId: this.request.conversationId,
        },
        classification: "P0",
      },
      {
        eventId: `${this.modelId}:start`,
        traceId: this.traceId,
        spanId: this.modelId,
        parentSpanId: this.turnId,
        occurredAt: this.startedAt,
        emitter: "provider",
        type: "span.start",
        spanKind: "model",
        name: this.request.providerId,
        attributes: {
          providerId: this.request.providerId,
          ...(this.request.modelId ? { modelId: this.request.modelId } : {}),
        },
        classification: "P0",
      },
    ]);
  }

  record(event: LocalAIStreamEvent): void {
    if (event.type === "interaction") {
      const input = event.input as { kind?: string } | null;
      if (
        event.name === WORKSPACE_QUERY_INTERACTION &&
        (input?.kind === "send_message" || input?.kind === "add_reaction")
      ) {
        this.spoke = true;
      }
      this.queue([
        {
          eventId: `${this.turnId}:interaction:${event.interactionId}`,
          traceId: this.traceId,
          spanId: this.turnId,
          parentSpanId: this.runId,
          occurredAt: this.now(),
          emitter: "tool",
          type: "span.event",
          spanKind: "turn",
          name: "Tool interaction requested",
          attributes: {
            interactionName: event.name,
            interactionKind: event.kind,
            ...(input?.kind ? { effectKind: input.kind } : {}),
          },
          classification: "P0",
        },
      ]);
      return;
    }
    if (event.type === "finish") {
      this.endFromStream(
        ["error", "content-filter"].includes(event.finishReason)
          ? "error"
          : event.finishReason === "aborted"
            ? "cancelled"
            : "ok",
        event.finishReason,
        event.usage,
      );
      return;
    }
    if (event.type === "error") {
      this.endFromStream("error", "error", undefined, event.error.name);
      return;
    }
    const chunk = event.chunk as {
      type?: string;
      toolCallId?: string;
      errorText?: string;
    };
    const callId = chunk.toolCallId;
    if (!callId) return;
    const toolId = `tool:${this.request.turnId}:${callId}`;
    if (chunk.type === "tool-input-start") {
      const toolName = toolNameOf(chunk) ?? "unknown";
      this.toolNames.set(callId, toolName);
      this.queue([
        {
          eventId: `${toolId}:start`,
          traceId: this.traceId,
          spanId: toolId,
          parentSpanId: this.modelId,
          occurredAt: this.now(),
          emitter: "tool",
          type: "span.start",
          spanKind: "tool",
          name: toolName,
          attributes: { toolCallId: callId, toolName },
          classification: "P0",
        },
      ]);
      return;
    }
    const toolName = this.toolNames.get(callId);
    if (!toolName) return;
    const outcome =
      chunk.type === "tool-output-available"
        ? "ok"
        : chunk.type === "tool-output-denied"
          ? "cancelled"
          : chunk.type === "tool-output-error" ||
              chunk.type === "tool-input-error"
            ? "error"
            : undefined;
    if (!outcome) return;
    this.queue([
      {
        eventId: `${toolId}:end`,
        traceId: this.traceId,
        spanId: toolId,
        parentSpanId: this.modelId,
        occurredAt: this.now(),
        emitter: "tool",
        type: "span.end",
        spanKind: "tool",
        name: toolName,
        status: outcome,
        attributes: {
          toolCallId: callId,
          toolName,
          ...(chunk.errorText ? { errorType: "tool-error" } : {}),
        },
        classification: "P0",
      },
    ]);
  }

  async complete(error?: unknown): Promise<void> {
    if (!this.ended) {
      this.endFromStream(
        error ? "error" : "ok",
        error ? "error" : "unknown",
        undefined,
        error instanceof Error ? error.name : undefined,
      );
    }
    await Promise.all(this.writes);
  }

  private endFromStream(
    status: TraceStatus,
    finishReason: string,
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    },
    errorName?: string,
  ): void {
    if (this.ended) return;
    this.ended = true;
    const occurredAt = this.now();
    const metrics = {
      ...(usage?.inputTokens !== undefined
        ? { inputTokens: usage.inputTokens }
        : {}),
      ...(usage?.outputTokens !== undefined
        ? { outputTokens: usage.outputTokens }
        : {}),
      ...(usage?.totalTokens !== undefined
        ? { totalTokens: usage.totalTokens }
        : {}),
    };
    this.queue([
      {
        eventId: `${this.modelId}:end`,
        traceId: this.traceId,
        spanId: this.modelId,
        parentSpanId: this.turnId,
        occurredAt,
        emitter: "provider",
        type: "span.end",
        spanKind: "model",
        name: this.request.providerId,
        status,
        attributes: {
          finishReason,
          ...(errorName ? { errorName } : {}),
        },
        metrics,
        classification: "P0",
      },
      {
        eventId: `${this.turnId}:end`,
        traceId: this.traceId,
        spanId: this.turnId,
        parentSpanId: this.runId,
        occurredAt,
        emitter: "main",
        type: "span.end",
        spanKind: "turn",
        name: "Agent turn",
        status,
        attributes: { spoke: this.spoke },
        classification: "P0",
      },
    ]);
  }

  private queue(inputs: TraceEventInput[]): void {
    this.writes.push(this.safeAppend(inputs));
  }

  private async safeAppend(inputs: TraceEventInput[]): Promise<void> {
    try {
      await this.sink.append(inputs);
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  private now(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }
}
