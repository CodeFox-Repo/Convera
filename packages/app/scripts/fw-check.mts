/**
 * Backend probe for "can this provider actually drive an agent turn".
 *
 * Runs one real turn through LocalAiRuntime with the workspace perception
 * tools attached, answering the tool round trips in process instead of via
 * the renderer's Dexie. A direct offer that ends silent is asked once more
 * with the executor's own reminder, so the recovery rate stays measurable.
 * Exits non-zero only when both turns end without speaking — the same
 * condition the agent host reports as a failed direct offer.
 *
 *   tsx scripts/fw-check.mts [providerId] [direct]
 *   FW_PROBE_TEXT="..."  overrides the incoming message
 */
import { LocalAiRuntime } from "@/electron/ai";
import { withWorkspacePerception } from "@/electron/ai/workspace-tools";
import { UNHEARD_REMINDER } from "@/electron/agent-host/executor";
import { buildChannelContext } from "@/renderer/libs/agent-projection";
import { config } from "dotenv";
config();

const providerId = process.argv[2] ?? "fireworks-api";
// "direct" reproduces an @-mention: no pass offered, a reply is expected.
const direct = process.argv[3] === "direct";

const RUN = `${Date.now()}`;
const REQUEST_ID = `fw-probe-${RUN}`;
const CHANNEL = { id: `chan-announcements-${RUN}`, name: "announcements" };
const self = { id: "member-quill", name: "Quill", kind: "agent" } as never;
const peers = [
  self,
  { id: "member-jackson", name: "Jackson", kind: "human" },
] as never[];

const sent: unknown[] = [];
const toolCalls: string[] = [];

const summary = {
  id: CHANNEL.id,
  name: CHANNEL.name,
  group: "Product",
  channelKind: "channel" as const,
  isPrivate: false,
  joined: true,
  memberCount: peers.length,
};

function answer(query: { kind: string }): unknown {
  toolCalls.push(query.kind);
  if (query.kind === "list_channels") {
    return { ok: true, kind: "list_channels", channels: [summary] };
  }
  if (query.kind === "read_channel") {
    return {
      ok: true,
      kind: "read_channel",
      channel: {
        ...summary,
        members: (peers as { id: string; name: string; kind: string }[]).map(
          (member) => ({
            memberId: member.id,
            name: member.name,
            kind: member.kind,
            status: "idle",
          }),
        ),
        messages: [
          {
            id: "msg-history-1",
            senderId: "member-jackson",
            senderName: "Jackson",
            content: "Setting up the new workspace today.",
            createdAt: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
        truncated: false,
      },
    };
  }
  if (query.kind === "send_message") {
    sent.push(query);
    return { ok: true, kind: "send_message", messageId: `msg-${RUN}` };
  }
  return { ok: false, error: { code: "UNKNOWN", message: query.kind } };
}

const runtime = new LocalAiRuntime({
  getToolGroups: async () => [],
  executeTool: async () => {
    throw new Error("MCP tools are not available in this probe");
  },
  turnHooks: withWorkspacePerception({}),
});

const status = await runtime.getProviderStatus(providerId as never);
console.log("STATUS:", status.availability, "-", status.detail);

const systemPrompt = [
  "You are Quill, the team's writer. You are warm and brief.",
  buildChannelContext(self, CHANNEL.name, peers, !direct, [], CHANNEL.id),
].join("\n\n");

const incoming =
  process.env.FW_PROBE_TEXT ??
  (direct
    ? "Jackson: @Quill what model are you running on right now?"
    : "Jackson: morning everyone! how's it going?");

let text = "";

/** One turn, resolving when the provider finishes. Mirrors executor.runTurn. */
async function turn(messages: { role: string; content: string }[]) {
  let done = false;
  text = "";
  await runtime.startChat(
    {
      requestId: REQUEST_ID,
      conversationId: CHANNEL.id,
      turnId: `fw-turn-${RUN}-${messages.length}`,
      providerId: providerId as never,
      agent: { id: "agent-quill", memberId: self.id, systemPrompt },
      operation: { kind: "rebase", reason: "regenerate", messages },
    } as never,
    (event: never) => {
      const e = event as {
        type: string;
        interactionId?: string;
        input?: { kind: string };
        chunk?: { type?: string; delta?: string };
        error?: { message: string };
      };
      if (e.type === "interaction" && e.interactionId && e.input) {
        const value = JSON.stringify(answer(e.input));
        const id = e.interactionId;
        queueMicrotask(() =>
          runtime.respondToInteraction(REQUEST_ID, id, { value }),
        );
      }
      if (e.chunk?.type === "text-delta") text += e.chunk.delta ?? "";
      if (e.type === "error") console.log("ERROR:", e.error?.message);
      if (e.type === "finish" || e.type === "error") done = true;
    },
  );
  for (let i = 0; i < 120 && !done; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const messages = [{ role: "user", content: incoming }];
await turn(messages);
console.log("TOOL CALLS:", toolCalls.length ? toolCalls.join(", ") : "(none)");
console.log("SPOKE:", sent.length > 0);

// A direct offer that ended silent is asked once more, exactly as the agent
// host does. Reported separately so the recovery rate stays measurable.
if (!sent.length && direct) {
  console.log("RAW TEXT:", text.trim().slice(0, 400) || "(empty)");
  console.log("RE-ASKING...");
  await turn([...messages, { role: "user", content: UNHEARD_REMINDER }]);
  console.log("SPOKE AFTER REMINDER:", sent.length > 0);
}

for (const message of sent) console.log("  →", JSON.stringify(message));
if (!sent.length)
  console.log("RAW TEXT:", text.trim().slice(0, 400) || "(empty)");
process.exit(sent.length ? 0 : 1);
