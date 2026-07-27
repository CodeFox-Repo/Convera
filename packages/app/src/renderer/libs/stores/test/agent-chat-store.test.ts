import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentChat } from "../agent-chat-store";

/**
 * Drives the store against a fake bridge instead of a running Electron window.
 *
 * The interesting behaviour here is not rendering, it is the translation from the agent's
 * message stream into a transcript and — the part that matters most — that a tool call
 * needing a human actually blocks and is resolved by the answer the human gives. Both are
 * deterministic without a GUI, and a GUI would not have proved either.
 */

type MessageCb = (payload: { turnId: string; message: unknown }) => void;
type ApprovalCb = (payload: {
  turnId: string;
  approvalId: string;
  action: string;
  summary: string;
  frontmostApp: string;
}) => void;

let emitMessage: MessageCb;
let emitApproval: ApprovalCb;
let answered: Array<{ approvalId: string; granted: boolean }>;
let sendResolve: (value: { success: boolean; error?: string }) => void;

beforeEach(() => {
  answered = [];
  useAgentChat.setState({
    entries: [],
    running: false,
    turnId: null,
    approval: null,
    model: null,
  });

  (globalThis as unknown as { window: unknown }).window = {
    agentAPI: {
      send: vi.fn(
        () =>
          new Promise<{ success: boolean; error?: string }>((resolve) => {
            sendResolve = resolve;
          }),
      ),
      stop: vi.fn(async () => ({ success: true })),
      respondToApproval: vi.fn(
        async (_turnId: string, approvalId: string, granted: boolean) => {
          answered.push({ approvalId, granted });
          return { success: true };
        },
      ),
      onMessage: (cb: MessageCb) => {
        emitMessage = cb;
        return () => undefined;
      },
      onApprovalRequest: (cb: ApprovalCb) => {
        emitApproval = cb;
        return () => undefined;
      },
    },
  };
});

const emit = (message: unknown) => emitMessage({ turnId: "t1", message });

describe("agent chat transcript", () => {
  it("records the prompt and marks the turn running", () => {
    const store = useAgentChat.getState();
    store.subscribe();
    void store.start("open safari");

    const state = useAgentChat.getState();
    expect(state.running).toBe(true);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      kind: "text",
      role: "user",
      text: "open safari",
    });
  });

  it("turns assistant text and tool calls into transcript entries", () => {
    useAgentChat.getState().subscribe();
    emit({ type: "system", subtype: "init", model: "claude-opus-5" });
    emit({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Taking a look." },
          {
            type: "tool_use",
            name: "mcp__desktop__computer",
            input: { action: "screenshot" },
          },
        ],
      },
    });

    const { entries, model } = useAgentChat.getState();
    expect(model).toBe("claude-opus-5");
    expect(entries.map((e) => e.kind)).toEqual(["text", "tool"]);
    expect(entries[1]).toMatchObject({
      name: "mcp__desktop__computer",
      outcome: "allowed",
    });
  });

  it("drops empty assistant text rather than rendering blank bubbles", () => {
    useAgentChat.getState().subscribe();
    emit({
      type: "assistant",
      message: { content: [{ type: "text", text: "   " }] },
    });
    expect(useAgentChat.getState().entries).toHaveLength(0);
  });

  it("surfaces an approval request and resolves it with the human's answer", async () => {
    useAgentChat.getState().subscribe();
    emitApproval({
      turnId: "t1",
      approvalId: "a1",
      action: "left_click",
      summary: "left click at (400, 400) in Safari",
      frontmostApp: "Safari",
    });

    const pending = useAgentChat.getState();
    expect(pending.approval?.summary).toContain("left click");
    expect(pending.entries.at(-1)).toMatchObject({
      kind: "tool",
      outcome: "pending",
    });

    await useAgentChat.getState().answerApproval(false);

    const after = useAgentChat.getState();
    expect(answered).toEqual([{ approvalId: "a1", granted: false }]);
    expect(after.approval).toBeNull();
    expect(after.entries.at(-1)).toMatchObject({ outcome: "denied" });
  });

  it("reports a failed turn instead of ending silently", async () => {
    const store = useAgentChat.getState();
    store.subscribe();
    const turn = store.start("do something");
    sendResolve({ success: false, error: "no display to capture" });
    await turn;

    const { running, entries } = useAgentChat.getState();
    expect(running).toBe(false);
    expect(entries.at(-1)).toMatchObject({ kind: "notice", tone: "error" });
  });

  it("keeps the per-turn cost visible", () => {
    useAgentChat.getState().subscribe();
    emit({
      type: "result",
      subtype: "success",
      num_turns: 3,
      total_cost_usd: 0.0671,
    });
    expect(
      (useAgentChat.getState().entries.at(-1) as { text: string }).text,
    ).toContain("$0.0671");
  });
});
