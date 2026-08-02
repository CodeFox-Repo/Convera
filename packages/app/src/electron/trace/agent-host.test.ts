import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentHostJob } from "@/shared/types/agent-host";
import type {
  LocalAIChatRequest,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import { AgentHostTraceRecorder } from "./agent-host";
import { LocalTraceStore } from "./store";

const job: AgentHostJob = {
  id: "run-1",
  taskId: "task-1",
  channelId: "channel-1",
  channelKind: "channel",
  conversationId: "conversation-1",
  triggerMessageId: "message-1",
  contextMessageIds: ["message-1"],
  mode: "direct",
  offeredAgentMemberIds: ["agent:one"],
  agentId: "one",
  agentMemberId: "agent:one",
  chain: { hops: 0, invoked: ["agent:one"] },
  controlInstructions: [],
  status: "running",
  attempts: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  startedAt: "2026-01-01T00:00:01.000Z",
};

const request: LocalAIChatRequest = {
  requestId: "request-1",
  turnId: "turn-1",
  conversationId: "conversation-1",
  providerId: "codex-cli",
  modelId: "gpt-test",
  operation: { kind: "bootstrap", messages: [] },
};

function chunk(value: Record<string, unknown>): LocalAIStreamEvent {
  return {
    type: "ui-message",
    requestId: request.requestId,
    chunk: value,
  } as unknown as LocalAIStreamEvent;
}

describe("AgentHostTraceRecorder", () => {
  it("records the canonical hierarchy and correlates parallel same-name tools by call id", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-agent-trace-"));
    try {
      const store = new LocalTraceStore(join(directory, "traces.jsonl"));
      const recorder = new AgentHostTraceRecorder(store);
      const turn = await recorder.beginTurn(job, request);
      turn.record(
        chunk({
          type: "tool-input-start",
          toolCallId: "call-1",
          toolName: "workspace:read_channel",
        }),
      );
      turn.record(
        chunk({
          type: "tool-input-start",
          toolCallId: "call-2",
          toolName: "workspace:read_channel",
        }),
      );
      turn.record(
        chunk({ type: "tool-output-available", toolCallId: "call-1" }),
      );
      turn.record(
        chunk({ type: "tool-output-available", toolCallId: "call-2" }),
      );
      turn.record({
        type: "finish",
        requestId: request.requestId,
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      });
      await turn.complete();
      await recorder.recordJob({
        ...job,
        status: "completed",
        completedAt: "2026-01-01T00:00:02.000Z",
        updatedAt: "2026-01-01T00:00:02.000Z",
      });

      const graph = await store.graph("trace:message-1");
      expect(graph.spans.map((span) => span.spanKind)).toEqual(
        expect.arrayContaining([
          "mission",
          "task",
          "run",
          "turn",
          "model",
          "tool",
          "tool",
        ]),
      );
      expect(
        graph.spans
          .filter((span) => span.spanKind === "tool")
          .map((span) => ({
            id: span.attributes.toolCallId,
            status: span.status,
          })),
      ).toEqual([
        { id: "call-1", status: "ok" },
        { id: "call-2", status: "ok" },
      ]);
      expect(
        graph.spans.find((span) => span.spanKind === "model")?.metrics,
      ).toEqual({ inputTokens: 100, outputTokens: 20, totalTokens: 120 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("links a silent retry to the turn it supersedes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-agent-trace-"));
    try {
      const store = new LocalTraceStore(join(directory, "traces.jsonl"));
      const recorder = new AgentHostTraceRecorder(store);
      const first = await recorder.beginTurn(job, request);
      await first.complete();
      const second = await recorder.beginTurn(
        job,
        { ...request, turnId: "turn-2" },
        request.turnId,
      );
      await second.complete();
      const graph = await store.graph("trace:message-1");
      expect(graph.edges).toContainEqual({
        fromSpanId: "turn:turn-1",
        toSpanId: "turn:turn-2",
        relation: "supersedes",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("closes open runtime spans when an interrupted job is recovered", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-agent-trace-"));
    try {
      const store = new LocalTraceStore(join(directory, "traces.jsonl"));
      const recorder = new AgentHostTraceRecorder(store);
      const turn = await recorder.beginTurn(job, request);
      turn.record(
        chunk({
          type: "tool-input-start",
          toolCallId: "call-before-crash",
          toolName: "workspace:read_channel",
        }),
      );
      await store.idle();

      await recorder.recordJob({
        ...job,
        status: "interrupted",
        completedAt: "2026-01-01T00:00:02.000Z",
        updatedAt: "2026-01-01T00:00:02.000Z",
      });

      const graph = await store.graph("trace:message-1");
      const runtimeSpans = graph.spans.filter((span) =>
        ["turn", "model", "tool"].includes(span.spanKind),
      );
      expect(runtimeSpans).toHaveLength(3);
      expect(runtimeSpans.every((span) => span.status === "interrupted")).toBe(
        true,
      );
      expect(runtimeSpans.every((span) => span.endedAt !== undefined)).toBe(
        true,
      );
      expect(
        runtimeSpans.every(
          (span) => span.attributes.recoveredAfterRestart === true,
        ),
      ).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
