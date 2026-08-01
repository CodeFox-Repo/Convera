# Agent collaboration in channels

How humans and agents share a room: what an agent can see, how it speaks, and
what carries a turn from a posted message to a reply. Read `.claude/CLAUDE.md`
first — this is the mechanism behind "agents are colleagues, not features".

## The model

- **Perception is pull-based.** An agent looks at the workspace through tools —
  `workspace:list_channels`, `workspace:read_channel` — when it decides it needs
  to. Nothing is pre-digested into its prompt. Visibility is enforced in exactly
  one function, `canViewChannel` in `src/renderer/libs/workspace-perception.ts`,
  and an invisible channel returns the *same* error as a nonexistent one, so
  agents cannot probe for hidden rooms. Channel isolation lands by editing that
  one function.
- **Speech is a tool call.** `workspace:send_message` is the only way an agent
  says anything; its turn output is invisible by design. Silence = no call = no
  trace. No reply bubble is ever pre-created. Mentions are re-parsed from the
  posted text — they route the next turn, so they must reflect what actually
  landed, not what the model intended.
- **Typing is read off the stream, never assumed.** An agent counts as typing
  from `tool-input-start` for `send_message` until that call closes, keyed by
  the stream's own `toolCallId`. Being offered a message, reading a channel and
  thinking are all *working*, not composing — and showing them as typing claims
  a reply is coming when most colleagues will stay quiet. Both the channel path
  (`agent-host-service.ts`) and the 1:1 path (`use-local-ai-chat.ts`) decide
  this through one shared function, `typingTransition` in `typing-store.ts`.
  Whoever opens an indicator owns closing it if the turn dies mid-call.
- **Delivery is a durable job queue.** `AgentHost` in the main process persists
  jobs to a JSON file, fans out one job per offered agent (parallel,
  `maxConcurrency` 3, keyed per conversation+actor), and asks the renderer to
  prepare and execute each turn over `agent-host:request`/`respond`. The
  renderer half is `RendererAgentHostService`
  (`src/renderer/libs/agent-host-service.ts`).
- **Turns are concurrent.** A turn that reserves no transcript row sets
  `concurrent: true` and serializes per (conversation, actor) rather than per
  conversation (`sessionKey` in `src/electron/ai/runtime.ts`), so colleagues
  think simultaneously while one agent's own turns still queue.

## Design decisions

These were decided deliberately. Change them on purpose, not by accident.

- **No default responder.** A channel is a room: posting notifies everyone
  present and each decides for itself. `defaultAgentMemberId` survives only for
  1:1 chats.
- **Everyone may answer.** Several agents replying to one greeting is a room
  working, not a bug — `buildChannelContext` in `agent-projection.ts` says so
  explicitly. A "designated responder" election was built and then removed;
  typing indicators for everyone who chooses to speak is the intended UX.
- **Agents may post to any channel they can see**, not only the one they were
  addressed in. `MAX_CHAIN_HOPS` (counting every agent message) contains the
  blast radius.
- **Reply markers are rare.** The boxed quote is a one-line strip (`↩ Name
  text`, `message-row.tsx`). The tool description tells agents a marker is for
  pulling an older or ambiguous message back into view — answering the latest
  message needs none.
- **Reasoning stays on.** With reasoning off, models answer into the void
  instead of calling the speech tool. `gpt-5.6-luna` runs at `medium` (no
  "auto" exists; "minimal" is a 400 on the 5.6 family); DeepSeek V4 Flash runs
  at `max`.

## Providers

| id | transport | notes |
| --- | --- | --- |
| `openai-api` | OpenAI Responses API | `gpt-5.6-luna`, the only model in its catalog, so nothing can pick an expensive one by accident. Default for hired agents. |
| `fireworks-api` | Fireworks Responses API | DeepSeek V4 Flash. `store: false`, `reasoningEffort: "max"`. |
| `claude-code` | Claude Agent SDK | Brings its own tools. |
| `codex-cli` | Codex app-server (local process) | Brings its own tools. |

Every OpenAI-compatible HTTP provider goes through the **Responses API**, not
`/chat/completions` — Fireworks implements `/v1/responses` at the same baseURL,
so both use `@ai-sdk/openai`'s callable provider rather than `.chat()`. The
other two are SDK/local-process transports and have no such dimension.

Fireworks passes `store: false` because Responses keeps conversations
server-side by default under a different retention policy than chat completions,
and a workspace transcript is not ours to leave there. It honours
`reasoningEffort` — probed directly, `none` returns no reasoning block at all
and writes 394 output tokens straight into the answer, while low/medium/high/max
all return reasoning and ~110-170.

## Silent turns

A model that ends its turn without calling `send_message` said nothing at all:
it wrote a perfectly good reply into turn output nobody can read. This happens
on **roughly 60% of direct offers**, on every provider tried. It is not a
prompt bug and not a provider bug.

A direct offer that ends silent is therefore asked once more — `runTurn` and
`remind` in `src/electron/agent-host/executor.ts`. The second ask reuses the
same `requestId` (the renderer routes tool answers and the typing indicator by
it) with a new `turnId` and a `rebase` operation, because only a rebase may
reset a session whose transcript the first turn already advanced. The
transcript gets one line appended saying nobody heard you. Only if that turn is
also silent does the job fail.

An open floor is asked once. Silence there is a complete answer.

One consequence: `RendererAgentHostService.handleStream` does **not** retire the
offer on `finish`/`error`. A finished turn is not a finished offer, and clearing
there left the second turn's `send_message` unanswered. The job's own terminal
status retires it (`start()`).

Measured on `fireworks-api` across 16 direct @-mentions: 6 spoke first try, 10
recovered on the re-ask, 0 stayed silent. `max` reasoning does not appear to
help the first-try rate (4/8 at default effort vs 2/8 at max) — but that sample
cannot tell 50% from 75%, so read it only as "max is not the fix", never as
"max is worse". **Don't re-run this comparison to settle it. Every probe is
real money, and the re-ask already takes the user-visible failure rate to
zero.** The re-ask will eventually fail twice on someone; that path is handled
— the job fails with the original error.

## Testing

Browser harness: `pnpm dev:web` in `packages/app` (port 5199). Keys come from
`packages/app/.env` (gitignored). Electron: `pnpm dev:start` — Electron cannot
be launched from an agent background shell, so ask a human to run it.

Full suite: `../../node_modules/.bin/vitest run` from `packages/app`.

To check whether a provider can actually drive a turn, with no browser, no
Electron and no Dexie:

```
cd packages/app
../../node_modules/.bin/tsx --tsconfig tsconfig.json scripts/fw-check.mts fireworks-api direct
```

It runs a real turn through `LocalAiRuntime` with the perception tools attached
and answers the tool round trips in process. Second arg `direct` reproduces an
@-mention and enables the re-ask; omit it for the open floor. `FW_PROBE_TEXT`
overrides the incoming message. Exits non-zero only when both the turn and its
re-ask end without speaking — the same condition the agent host reports as a
failed direct offer.

Two things that will bite:

- The dev job store lives at `$TMPDIR/convera-dev-agent-host-jobs.json`. Delete
  it whenever Dexie is wiped, or cancelled jobs from a previous life resurrect.
- The pre-push hook lints, tests, and auto-formats. Commit its formatting diff
  and push again.

Symptom worth memorising: **"the agent decided not to answer" and "the agent was
never asked" look identical from the UI.** Check the job store before blaming
the model.

## Known gaps

- `Channel.description` does not exist yet, though `.claude/CLAUDE.md` treats it
  as real context. Needs a Dexie migration, UI, and inclusion in `read_channel`.
- 1:1 chats still use the old reserve-a-bubble flow; only channels use
  agent-initiated speech.
- The pass token (`isPass`) is legacy from the pre-tool era. The empty-shell
  cleanup in chat-store still uses it; removable once nothing reserves shells.
- Per-agent tasks/queue UI (PR #216) is untouched by this work.
