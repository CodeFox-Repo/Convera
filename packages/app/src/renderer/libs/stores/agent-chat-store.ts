import { create } from "zustand";

/**
 * Transcript state for the local agent loop.
 *
 * Consumes the IPC event stream from the main process rather than ai-sdk's `useChat`.
 * The agent's messages carry things that protocol has no room for — tool calls with their
 * inputs, a blocking approval request, a per-turn cost — and the approval flow in
 * particular is the reason this app can be trusted with a mouse, so it cannot be squeezed
 * into a text-delta stream.
 */

export interface AgentTextEntry {
  kind: "text";
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface AgentToolEntry {
  kind: "tool";
  id: string;
  name: string;
  input: Record<string, unknown>;
  outcome: "pending" | "allowed" | "denied";
}

export interface AgentNoticeEntry {
  kind: "notice";
  id: string;
  text: string;
  tone: "info" | "error";
}

export type AgentEntry = AgentTextEntry | AgentToolEntry | AgentNoticeEntry;

export interface PendingApproval {
  turnId: string;
  approvalId: string;
  action: string;
  summary: string;
  frontmostApp: string;
}

interface AgentChatState {
  entries: AgentEntry[];
  running: boolean;
  turnId: string | null;
  approval: PendingApproval | null;
  model: string | null;

  start: (prompt: string) => Promise<void>;
  stop: () => Promise<void>;
  answerApproval: (granted: boolean) => Promise<void>;
  clear: () => void;
  /** Wires the IPC listeners. Returns an unsubscribe for effect cleanup. */
  subscribe: () => () => void;
}

let entrySeq = 0;
const nextId = () => `entry-${++entrySeq}`;

/** Anthropic's SDK message shapes, narrowed to the parts this transcript renders. */
interface SdkBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}
interface SdkMessage {
  type: string;
  subtype?: string;
  model?: string;
  message?: { content?: SdkBlock[] };
  error?: string;
  num_turns?: number;
  total_cost_usd?: number;
}

export const useAgentChat = create<AgentChatState>((set, get) => ({
  entries: [],
  running: false,
  turnId: null,
  approval: null,
  model: null,

  start: async (prompt: string) => {
    if (get().running) return;
    const turnId = `turn-${Date.now()}`;
    set((s) => ({
      turnId,
      running: true,
      entries: [
        ...s.entries,
        { kind: "text", id: nextId(), role: "user", text: prompt },
      ],
    }));

    const result = await window.agentAPI.send(turnId, prompt);
    // The handler resolves when the stream ends, so this is also the turn's end.
    set((s) => ({
      running: false,
      turnId: null,
      approval: null,
      entries: result.success
        ? s.entries
        : [
            ...s.entries,
            {
              kind: "notice",
              id: nextId(),
              tone: "error",
              text: result.error ?? "the turn failed",
            },
          ],
    }));
  },

  stop: async () => {
    const { turnId } = get();
    if (turnId) await window.agentAPI.stop(turnId);
    set({ running: false, approval: null });
  },

  answerApproval: async (granted: boolean) => {
    const approval = get().approval;
    if (!approval) return;
    set((s) => ({
      approval: null,
      entries: s.entries.map((e) =>
        e.kind === "tool" && e.outcome === "pending"
          ? { ...e, outcome: granted ? "allowed" : "denied" }
          : e,
      ),
    }));
    await window.agentAPI.respondToApproval(
      approval.turnId,
      approval.approvalId,
      granted,
    );
  },

  clear: () => set({ entries: [], approval: null, model: null }),

  subscribe: () => {
    const offMessage = window.agentAPI.onMessage(({ message }) => {
      const sdk = message as SdkMessage;

      if (sdk.type === "system" && sdk.subtype === "init" && sdk.model) {
        set({ model: sdk.model });
        return;
      }

      if (sdk.type === "error" && sdk.error) {
        set((s) => ({
          entries: [
            ...s.entries,
            { kind: "notice", id: nextId(), tone: "error", text: sdk.error! },
          ],
        }));
        return;
      }

      if (sdk.type === "assistant") {
        const blocks = sdk.message?.content ?? [];
        const added: AgentEntry[] = [];
        for (const block of blocks) {
          if (block.type === "text" && block.text?.trim()) {
            added.push({
              kind: "text",
              id: nextId(),
              role: "assistant",
              text: block.text,
            });
          } else if (block.type === "tool_use" && block.name) {
            added.push({
              kind: "tool",
              id: nextId(),
              name: block.name,
              input: block.input ?? {},
              // Tools that need a human are marked pending by the approval event; anything
              // that runs without one is already done by the time we see it.
              outcome: "allowed",
            });
          }
        }
        if (added.length) set((s) => ({ entries: [...s.entries, ...added] }));
        return;
      }

      if (sdk.type === "result") {
        const cost = sdk.total_cost_usd ?? 0;
        set((s) => ({
          entries: [
            ...s.entries,
            {
              kind: "notice",
              id: nextId(),
              tone: "info",
              text: `${sdk.subtype ?? "done"} · ${sdk.num_turns ?? 0} turns · $${cost.toFixed(4)}`,
            },
          ],
        }));
      }
    });

    const offApproval = window.agentAPI.onApprovalRequest((request) => {
      set((s) => ({
        approval: request,
        entries: [
          ...s.entries,
          {
            kind: "tool",
            id: nextId(),
            name: request.action,
            input: {},
            outcome: "pending",
          },
        ],
      }));
    });

    return () => {
      offMessage();
      offApproval();
    };
  },
}));
