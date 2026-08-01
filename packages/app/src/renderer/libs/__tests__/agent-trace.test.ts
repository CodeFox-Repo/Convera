import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { beginTrace, endTrace, noteRetry, recordTrace } from "../agent-trace";
import type { LocalAIStreamEvent } from "@/shared/types/local-ai";

const REQUEST = "request-1";

function chunk(chunk: Record<string, unknown>): LocalAIStreamEvent {
  return {
    type: "ui-message",
    requestId: REQUEST,
    chunk,
  } as LocalAIStreamEvent;
}

function speech(content: string): LocalAIStreamEvent {
  return {
    type: "interaction",
    requestId: REQUEST,
    interactionId: "i1",
    kind: "input",
    name: "workspace:query",
    prompt: "",
    input: { kind: "send_message", content },
  } as LocalAIStreamEvent;
}

async function stored() {
  return (await db.agentTraces.toArray())[0];
}

beforeEach(async () => {
  await db.open();
  await db.agentTraces.clear();
  beginTrace({
    requestId: REQUEST,
    conversationId: "conversation",
    memberId: "agent:fizz",
    jobId: "job",
  });
});

describe("agent trace", () => {
  it("records the tool sequence and what was said", async () => {
    recordTrace(
      chunk({
        type: "tool-input-start",
        toolCallId: "c1",
        toolName: "workspace:read_channel",
      }),
    );
    recordTrace(chunk({ type: "tool-output-available", toolCallId: "c1" }));
    recordTrace(
      chunk({
        type: "tool-input-start",
        toolCallId: "c2",
        toolName: "workspace:send_message",
      }),
    );
    recordTrace(speech("大家好！"));
    recordTrace(chunk({ type: "tool-output-available", toolCallId: "c2" }));
    await endTrace(REQUEST);

    const trace = await stored();
    expect(trace.spoke).toBe(true);
    expect(trace.steps.map((step) => [step.tool, step.outcome])).toEqual([
      ["read_channel", "completed"],
      ["send_message", "completed"],
    ]);
    expect(trace.steps[1].detail).toBe("大家好！");
  });

  it("keeps the turn's own words when it never called the tool", async () => {
    // The failure that is otherwise invisible: the model wrote a good reply
    // into its turn output, which nobody in the room can read.
    recordTrace(chunk({ type: "text-delta", delta: "Hello everyone!" }));
    await endTrace(REQUEST);

    const trace = await stored();
    expect(trace.spoke).toBe(false);
    expect(trace.steps).toEqual([]);
    expect(trace.turnText).toBe("Hello everyone!");
  });

  it("marks a call the model opened but never completed", async () => {
    recordTrace(
      chunk({
        type: "tool-input-start",
        toolCallId: "c1",
        toolName: "workspace:send_message",
      }),
    );
    await endTrace(REQUEST);

    const trace = await stored();
    // Exactly the reported symptom: typing appeared, nothing was said.
    expect(trace.spoke).toBe(false);
    expect(trace.steps).toEqual([
      expect.objectContaining({ tool: "send_message", outcome: "started" }),
    ]);
  });

  it("records a tool error with its reason", async () => {
    recordTrace(
      chunk({
        type: "tool-input-start",
        toolCallId: "c1",
        toolName: "workspace:send_message",
      }),
    );
    recordTrace(
      chunk({
        type: "tool-output-error",
        toolCallId: "c1",
        errorText: "content must be at most 2000 characters",
      }),
    );
    await endTrace(REQUEST);

    const trace = await stored();
    expect(trace.steps[0]).toMatchObject({
      outcome: "error",
      detail: "content must be at most 2000 characters",
    });
  });

  it("shows the re-ask as one turn rather than two calls", async () => {
    recordTrace(chunk({ type: "text-delta", delta: "I think..." }));
    noteRetry(REQUEST);
    recordTrace(
      chunk({
        type: "tool-input-start",
        toolCallId: "c2",
        toolName: "workspace:send_message",
      }),
    );
    recordTrace(speech("大家好"));
    recordTrace(chunk({ type: "tool-output-available", toolCallId: "c2" }));
    await endTrace(REQUEST);

    const trace = await stored();
    expect(trace.spoke).toBe(true);
    expect(trace.steps.map((step) => step.tool)).toEqual([
      "(re-asked)",
      "send_message",
    ]);
    // Why it went quiet the first time is the point of keeping this.
    expect(trace.turnText).toBe("I think...");
  });

  it("ignores events from another request", async () => {
    recordTrace({
      type: "ui-message",
      requestId: "someone-else",
      chunk: {
        type: "tool-input-start",
        toolCallId: "x",
        toolName: "workspace:send_message",
      },
    } as LocalAIStreamEvent);
    await endTrace(REQUEST);

    expect((await stored()).steps).toEqual([]);
  });
});
