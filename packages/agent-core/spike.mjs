// Two questions this answers, both of which burned us earlier:
//   1. Does the agent core run on the user's own credentials with hands attached?
//   2. Does the approval gate ACTUALLY fire — or is it silently shadowed like the first spike?
// Nothing is approved here, so the mouse never moves.
import { run } from "./dist/index.js";

const asked = [];

async function go(label, prompt, approve) {
  console.log(`\n──── ${label} ────`);
  for await (const m of run(prompt, { approve, maxTurns: 6 })) {
    if (m.type === "system" && m.subtype === "init") {
      console.log("[init] model:", m.model);
      console.log("[init] mcp tools:", (m.tools || []).filter((t) => t.startsWith("mcp__")));
    }
    if (m.type === "assistant") {
      for (const b of m.message.content) {
        if (b.type === "text" && b.text.trim()) console.log("[text]", b.text.trim().slice(0, 300));
        if (b.type === "tool_use") console.log("[tool_use]", b.name, JSON.stringify(b.input).slice(0, 120));
      }
    }
    if (m.type === "result") {
      console.log("[result]", m.subtype, "| turns:", m.num_turns, "| $" + (m.total_cost_usd ?? 0).toFixed(4));
    }
  }
}

// 1. Read-only: screenshot needs no approval.
await go("READ-ONLY (no approval needed)", "Use the desktop context tool once, then say in one short line which app is frontmost. Nothing else.", async () => {
  throw new Error("approval must NOT be requested for read-only actions");
});

// 2. Write action with a DENYING gate. The point is that the gate is consulted at all.
await go(
  "WRITE ACTION (gate denies everything)",
  "Move the mouse to coordinate 400,400 using the desktop computer tool. If it is refused, say REFUSED and stop.",
  async (req) => {
    asked.push(req);
    console.log("  ⟵ APPROVAL ASKED:", JSON.stringify({ action: req.action, summary: req.summary }));
    return false;
  },
);

console.log("\n════ verdict ════");
console.log("approval callback fired:", asked.length, "time(s)");
console.log(asked.length > 0 ? "✅ gate is LIVE — not shadowed" : "❌ gate NEVER FIRED — shadowed again");
