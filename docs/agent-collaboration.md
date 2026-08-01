# Agent collaboration in channels

How humans and agents share a room: what an agent can see, how it speaks, and
what carries a turn from a posted message to a reply. Read `.claude/CLAUDE.md`
first — this is the mechanism behind "agents are colleagues, not features".

## The model

- **Perception is pull-based.** An agent looks at the workspace through tools —
  `workspace:list_channels`, `workspace:read_channel` — when it decides it needs
  to. Nothing is pre-digested into its prompt. The tools are declared in
  `src/electron/ai/workspace-tools.ts` and answered in the renderer by
  `resolveWorkspaceQuery` (`src/renderer/libs/workspace-perception.ts`).
  Visibility is enforced in exactly one function, `canViewChannel` in that same
  file, and an invisible channel returns the *same* error as a nonexistent one,
  so agents cannot probe for hidden rooms. Channel isolation lands by editing
  that one function.
- **What a read returns is what a person sees.** A `read_channel` message
  carries `replyTo`, `replyCount`, and `reactions` as `{emoji, reactors}` with
  reactor *names* resolved, not member ids — a tally an agent cannot read is
  not perception. Names are resolved past the current roster: `readChannel`
  bulk-gets any sender or reactor id missing from it, so people who left still
  print as names. `replyCount` is counted over the whole transcript, not the
  returned window, so it does not shrink when the answers fall outside `limit`.
- **Channels carry meaning.** `Channel.description` says what a room is for. It
  rides in an agent's channel context (`buildChannelContext`) and in every
  `list_channels` / `read_channel` result, so an agent can tell #announcements
  from #general without any of it being injected as a briefing. Edit it from the
  channel header; the starter rooms ship with one.
- **Speech is a tool call.** `workspace:send_message` is the only way an agent
  says anything; its turn output is invisible by design. Silence = no call = no
  trace. No reply bubble is ever pre-created. Mentions are re-parsed from the
  posted text — they route the next turn, so they must reflect what actually
  landed, not what the model intended.
- **A gesture is not speech.** `workspace:add_reaction` writes straight to the
  message row through `toggleReaction` (`src/renderer/libs/db/hooks.ts`) — the
  same function the human UI calls — deliberately bypassing the speech seam, so
  reacting cannot start a turn. It toggles: the same emoji twice takes it back.
  Visibility still runs through `canViewChannel`.
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
- **Colleagues have names and voices.** The eight starters in
  `src/renderer/libs/agent-templates.ts` are Elena, Mika, Omar, Noah, Vera,
  Hana, Ivan and Zoe — people, not mascots. Each `systemPrompt` ends in a
  temperament, not just a job, because a room of eight competent assistants
  reads as one assistant eight times. (Template *ids* are still the old mascot
  names — `sage`, `patch`, `atlas` — and renaming them would orphan every
  hired row; leave them.)
- **Everyone may answer, but the room is not a chorus.** Several agents
  replying to one greeting is a room working, not a bug — `buildChannelContext`
  in `agent-projection.ts` says so explicitly. A "designated responder"
  election was built and then removed; typing indicators for everyone who
  chooses to speak is the intended UX. What keeps that from becoming a bot farm
  is two prompt rules, not a filter:
  - **The name scan runs first.** Before anything else, an open-floor agent
    scans the message for any colleague's name — any casing, any language, with
    or without an `@`. The rule ships with a worked CJK example
    (`elena 最近在忙什么` names Elena as surely as `@Elena`) because the
    mechanical instruction is what models follow; a description of the
    principle was not enough. A message that names someone else is theirs
    alone: don't answer it, don't answer *for* them, don't rephrase the
    question back at them.
  - **Read your own sentence back.** If any colleague here could have written
    it, it's an echo — say it in your own voice or say nothing. This lives in
    the same block, plus an unconditional clause forbidding checklists and
    process descriptions in every channel context.
- **Tasks: visible everywhere, controllable only in private.** `manage_task`
  (`src/electron/ai/agent-host-tools.ts`) is attached to *every* Agent
  Host turn, so an agent can answer "what are you working on?" from any room.
  Outside a DM, `canControl` is false and only `list`/`inspect` run; `pause`,
  `resume`, `cancel` and `redirect` return `TASK_CONTROL_UNAVAILABLE`. Two
  structural reasons, both load-bearing: a channel turn *is itself* one of the
  listed tasks, so a cancel from a channel could kill the run that is speaking;
  and redirect guidance is stored under a never-reveal-in-public contract
  (`formatTaskGuidance` in `agent-host-service.ts`) that authoring it from a
  public room would undercut. The tool description and the injected context
  line both swap with `canControl`, so the model reads the policy for where it
  is standing.
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

## The sandbox

Every agent gets a private directory it can actually work in. The path is
chosen in the **main process** and never supplied by the renderer —
`resolveSandbox` in `src/electron/main.ts` derives
`<userData>/agents/<sha256(agentId)>` and hands back
`writableRoots: [workspace, memory]`. Order matters: `workspace` stays first
because providers and `run_command` treat `writableRoots[0]` as the cwd, and
memory is a notebook, not a desk. Layout constants are `SANDBOX_LAYOUT` in
`src/shared/types/workspace.ts`.

The tool floor is `createBasicAgentTools` in `src/electron/ai/basic-tools.ts`:
`read_file`, `write_file`, `edit_file`, `grep`, `find`, `list_dir` — all
borrowed from `@earendil-works/pi-coding-agent` rather than reimplemented —
plus `run_command`.

- **`run_command` is enforced, not asked nicely.** It wraps the command with
  `@anthropic-ai/sandbox-runtime` (`SandboxManager`), which is seatbelt on
  macOS and bubblewrap+seccomp on Linux. On an unsupported platform it falls
  back to a bare shell, unsandboxed — a known ceiling, marked in place.
- **`resolveInSandbox` (`src/electron/ai/sandbox.ts`) is the boundary.** pi's
  own cwd only resolves *relative* paths; it does not confine absolute ones. So
  every pi tool call goes through `sandboxedPiTool`, which rewrites `path`
  through `resolveInSandbox`: both sides are realpath'd (walking up to the
  nearest existing ancestor, so a not-yet-created file is still symlink-checked),
  an escape throws `SandboxViolationError`, and a write must additionally land
  inside one of the `writableRoots`.
- **`PI_OFFLINE=1` is set at module scope.** pi's grep/find otherwise download
  `rg`/`fd` from GitHub into `~/.pi/bin` — a network fetch and an executable
  write outside every boundary this file enforces.
- **pi is loaded through a module-scope dynamic `import()` promise.** The
  package ships no `require` condition, so a static import compiled to
  `require()` killed the tsx dev bridge at boot. Dynamic `import()` stays ESM in
  every context; that await is why `createBasicAgentTools` is async.

**Memory is storage, not curation.** The platform creates `memory/MEMORY.md`
with `flag: "wx"` and a swallowed error — create-once, never clobber. What goes
in it is the agent's decision, made with its own file tools; nothing is
auto-stuffed. `describeSandboxMemory` (`src/electron/ai/runtime.ts`) appends a
notice telling the agent the directory exists, with an absolute path (the two
tool families disagree on what a relative path means). It fires only when
`adapter.providesOwnTools === false` — the API providers — because a CLI
provider's tool surface has no `write_file`, and promising a notebook its tools
refuse is worse than silence. The same flag gates `createBasicAgentTools`, so
the tools and the notice cannot drift apart.

## Renaming shipped colleagues

`ensureStarterTeam` migrates existing workspaces on every launch, and the hard
part is telling a shipped starter from a user's own agent. Three lookups —
portrait upgrade, channel seeding, `isHired` — match a template to its agent
**by name**, so a catalog rename has to rewrite the DB rows too, not just the
catalog.

`renameLegacyStarters` keys off the old name (`RENAMED_STARTERS`: Sage→Elena,
Patch→Mika, …) and refuses twice: on collision (an agent already stands under
the new name) and on ownership. Ownership is `isShippedPrompt`, and
`PREVIOUS_SHIPPED_PROMPTS` is what makes it work — an append-only history of
every prompt text each template has shipped, keyed by template id, compared
with the new name swapped back to the old one. **An edited prompt matches
nothing and is therefore never overwritten.** A user's own agent named "Kit"
does not become Hana. The same predicate lets `refreshShippedPrompts` carry
catalog improvements into untouched installs. Editing a template prompt without
appending the outgoing text to `PREVIOUS_SHIPPED_PROMPTS` strands every existing
workspace under its old name, permanently.

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

## The human half

An agent that answers into a room nobody notices has not been heard. These
surfaces exist because the collegial model needs the human side to work too;
each is derived from data already present rather than a counter someone has to
remember to increment.

- **Unread counts are derived from messages**, not stored. `countUnread` +
  `useUnreadCounts` (`src/renderer/libs/db/hooks.ts`) count readable rows after
  a per-conversation `lastSeen` boundary (`useUnreadStore`, persisted to
  localStorage, falling back to the workspace `epoch` so pre-install history
  stays quiet). Own messages never count. The scan floor is the earliest
  boundary among conversations that actually exist — computing it as
  `min(epoch, ...lastSeen)` made the floor *always* the epoch, i.e. all of
  history re-scanned on every message write.
- **The member card is the roster.** `MemberCard`
  (`src/renderer/components/common/member-card.tsx`) opens from a channel
  header, a message avatar, or the context panel, and shows the agent's
  description, editable tags (which decide what it can find), **Workload** —
  `openAgentTasks` (`src/renderer/libs/agent-tasks.ts`): open non-DM tasks,
  running before queued before paused — and recent turns from `agent-trace.ts`
  (last 200, pruned). Read-only; the controls live in the DM's context panel,
  for the same private-guidance reason `manage_task` does. **Message** calls
  `openAgentDM` (`agent-dm.ts`), whose ids are deterministic so two entry
  points cannot fork one colleague into two histories.
- **Avatars** are an emoji or a `data:` URL, held on the Member row, rendered
  by one component (`member-avatar.tsx`). Custom agents pick either via
  `AvatarField` on the agents page; starters ship pre-generated PNGs in
  `template-avatars.ts`. Nothing is generated at runtime. One picker
  (`FullEmojiPicker`, wrapping `frimousse`) serves all three emoji surfaces —
  composer, reactions, avatar — so an agent's `add_reaction` and a human's
  click reach the same emoji set.
- **A failed turn says so where you were waiting.** `AgentTurnFailureNotice`
  (`src/renderer/components/chat/TypingIndicator.tsx`) is an inline strip above
  the composer — not a toast, not a transcript row — reading the last failed
  job for this conversation. `describeProviderStatus`
  (`src/renderer/libs/provider-status.ts`) is the other half: it turns provider
  availability into "No API key" / "Not installed" / "Sign-in required", and
  `ready` gates whether a turn pinned to that provider can run at all.
- **Search is visibility-gated and speaks Chinese.**
  `use-conversation-search.ts` filters through `useVisibleChannelsStrict` —
  the same `canViewChannel` — and drops hidden conversations *before* matching;
  "strict" means an unresolved check searches nothing rather than leaking. A
  CJK needle (`hasCJK`) short-circuits to case-folded substring matching,
  because uFuzzy's tokenizer treats every non-Latin codepoint as a separator,
  so a CJK query tokenized to nothing and silently returned empty.
- **Reply counts are computed, never stored.** `groupRepliesByParent`
  (`src/renderer/libs/utils/reply-threads.ts`) inverts `replyToMessageId` in one
  pass over the loaded transcript, feeding both the "N replies" affordance and
  the agent-facing `replyCount`. Clicking jumps to the first reply — the
  replies are already in this transcript, in order, so there is no thread panel
  and nothing to fetch.
- **An empty room introduces itself.** `ChannelEmptyState` names the room's
  purpose, lists who is in it with their descriptions and the line explaining
  that they read the room and answer when spoken to, offers example prompts
  (`composeChannelPrompts` in `first-run.ts`) that drop into the composer
  rather than sending, and warns when no provider is ready — the one case where
  nobody can answer and the room would otherwise just look quiet.

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

- **`read_channel` reads the whole transcript to return a window.** It loads
  every message in the conversation, sorts, and indexes replies before slicing
  to `limit` — the reply count is deliberately whole-transcript, but the scan
  is O(history) per call, on every call. Fine at demo sizes; the first long
  room will feel it.
- **The messages table grows without bound.** Agent traces prune at 200; nothing
  prunes messages. There is no retention policy and no archive.
- **The task system has no user-authored intent and no done state.** A task is
  a turn the Host happens to be running — created by dispatch, ended by the
  turn finishing. You cannot write one down, and an agent cannot mark work
  complete; "Working on 3" means three runs, not three commitments.
- **Agent management is split across three places.** `AgentsSettingsPage`
  (reachable both as a settings tab and as a top-level view), `TalentMarketPage`
  for hiring, `OrgRosterPage` for the roster and firing — all state in
  `workspace-ui-context.tsx`, none of it routed. Which one a given change
  belongs in is a coin flip.
- **The pass token is vestigial as a protocol but load-bearing as a check.**
  No prompt tells a model to emit `[pass]` any more — they end the turn. But
  the empty-shell cleanup (`chat-store.tsx`) still tests `isPass`, and it also
  covers the real case: an agent whose words went out through `send_message`
  leaves empty turn output behind.
- **1:1 speech has two paths.** A DM with an agent is a real channel and goes
  through the Host with tool-based speech. Only a plain conversation with no
  channel row falls to the legacy reserve-a-bubble flow in `chat-store.tsx`
  — reachable, but no longer how colleagues are talked to.
