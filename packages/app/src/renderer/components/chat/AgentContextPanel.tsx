import {
  inspectAgentDMContext,
  type AgentContextInspection,
} from "@/renderer/libs/agent-context-inspector";
import { cn } from "@/renderer/libs/utils/tailwind";
import { AgentTraceSection } from "./AgentTraceSection";
import { useAgentHostTasks } from "@/renderer/libs/hooks/use-agent-host-jobs";
import { taskStatusLabel } from "@/renderer/libs/agent-tasks";
import { memberIdForAgent } from "@/renderer/libs/db";
import { useChannels } from "@/renderer/libs/stores/channel-store";
import { useMembers } from "@/renderer/libs/stores/member-store";
import { motion } from "framer-motion";
import {
  Activity,
  Brain,
  Eye,
  ListTree,
  Loader2,
  LockKeyhole,
  Pause,
  Play,
  RotateCcw,
  Send,
  Square,
  Wrench,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Brain;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-lg border border-sidebar-border bg-sidebar-accent/35 p-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground">
        <Icon size={13} className="text-muted-foreground" />
        {title}
      </h4>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
  );
}

function AgentWorkSection({ agentId }: { agentId: string }) {
  const agentMemberId = memberIdForAgent(agentId);
  const { tasks, error, control, redirect } = useAgentHostTasks(agentMemberId);
  const channels = useChannels();
  const members = useMembers();
  const [guidingTaskId, setGuidingTaskId] = useState<string>();
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<string>();
  const channelNames = useMemo(
    () =>
      new Map((channels ?? []).map((channel) => [channel.id, channel.name])),
    [channels],
  );
  const memberNames = useMemo(
    () => new Map((members ?? []).map((member) => [member.id, member.name])),
    [members],
  );
  const visibleTasks = tasks
    .filter((task) => task.channelKind !== "dm")
    .slice(0, 20);

  async function runControl(
    taskId: string,
    action: "pause" | "resume" | "cancel",
  ) {
    setBusy(`${taskId}:${action}`);
    try {
      await control(taskId, action);
    } finally {
      setBusy(undefined);
    }
  }

  async function submitGuidance(taskId: string) {
    const value = instruction.trim();
    if (!value) return;
    setBusy(`${taskId}:redirect`);
    try {
      if (await redirect(taskId, value)) {
        setInstruction("");
        setGuidingTaskId(undefined);
      }
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Section icon={Activity} title="Work in channels">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Chat here to let this agent inspect and control its own work. Buttons
        below act directly on Agent Host and do not wait for the model.
      </p>
      {error && (
        <p className="text-xs leading-relaxed text-destructive">{error}</p>
      )}
      {visibleTasks.length === 0 ? (
        <Empty>No channel tasks are recorded for this agent yet.</Empty>
      ) : (
        <div className="space-y-2">
          {visibleTasks.map((task) => {
            const isActive =
              task.status === "running" || task.status === "queued";
            const isPaused = task.status === "paused";
            const channelName =
              channelNames.get(task.channelId) ?? task.channelId;
            const latestGuidance = task.controlInstructions.at(-1);
            const guiding = guidingTaskId === task.id;
            const collaboration = task.collaboration;
            const sourceName = collaboration
              ? (memberNames.get(collaboration.fromMemberId) ??
                collaboration.fromMemberId)
              : undefined;
            return (
              <article
                key={task.id}
                className={cn(
                  "border-l-2 py-1 pl-3",
                  isActive
                    ? "border-primary"
                    : isPaused
                      ? "border-amber-500"
                      : "border-sidebar-border",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      #{channelName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {taskStatusLabel(task.status)} · {task.runCount} run
                      {task.runCount === 1 ? "" : "s"} · {task.id.slice(-8)}
                    </p>
                    {collaboration && (
                      <div
                        className="mt-1.5 rounded-md border border-sidebar-border bg-background/50 px-2 py-1.5"
                        data-testid="structured-task-provenance"
                      >
                        <p className="text-[11px] font-medium text-sidebar-foreground">
                          {collaboration.kind === "delegation"
                            ? `Delegated by ${sourceName}`
                            : `Handed off by ${sourceName}`}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          {collaboration.brief.objective}
                        </p>
                        {(task.outputMessageIds?.length ?? 0) > 0 && (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {task.outputMessageIds?.length} delivered result
                            {task.outputMessageIds?.length === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                    )}
                    {latestGuidance && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                        Guidance: {latestGuidance}
                      </p>
                    )}
                    {task.error && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-destructive">
                        {task.error}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-0.5">
                    {isActive && (
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground transition-colors pointer-events-auto hover:text-sidebar-foreground"
                        disabled={busy !== undefined}
                        onClick={() => void runControl(task.id, "pause")}
                        aria-label={`Pause work in ${channelName}`}
                        title="Pause"
                      >
                        <Pause size={12} />
                      </button>
                    )}
                    {isPaused && (
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground transition-colors pointer-events-auto hover:text-sidebar-foreground"
                        disabled={busy !== undefined}
                        onClick={() => void runControl(task.id, "resume")}
                        aria-label={`Resume work in ${channelName}`}
                        title="Resume"
                      >
                        <Play size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground transition-colors pointer-events-auto hover:text-sidebar-foreground"
                      disabled={busy !== undefined}
                      onClick={() => {
                        setGuidingTaskId(guiding ? undefined : task.id);
                        setInstruction("");
                      }}
                      aria-label={`Guide work in ${channelName}`}
                      aria-expanded={guiding}
                      title="Redirect with guidance"
                    >
                      <RotateCcw size={12} />
                    </button>
                    {![
                      "completed",
                      "failed",
                      "cancelled",
                      "interrupted",
                    ].includes(task.status) && (
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground transition-colors pointer-events-auto hover:text-destructive"
                        disabled={busy !== undefined}
                        onClick={() => void runControl(task.id, "cancel")}
                        aria-label={`Cancel work in ${channelName}`}
                        title="Cancel"
                      >
                        <Square size={12} />
                      </button>
                    )}
                  </div>
                </div>
                {guiding && (
                  <div className="mt-2 space-y-1.5">
                    <textarea
                      value={instruction}
                      onChange={(event) => setInstruction(event.target.value)}
                      className="min-h-20 w-full resize-y rounded-md border border-sidebar-border px-2 py-1.5 text-xs text-sidebar-foreground outline-none pointer-events-auto focus:border-ring"
                      maxLength={4_000}
                      placeholder="What should change in the replacement run?"
                      aria-label={`Private guidance for work in ${channelName}`}
                    />
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-md border border-sidebar-border px-2 py-1 text-xs font-medium text-sidebar-foreground transition-colors pointer-events-auto hover:border-ring disabled:opacity-50"
                      disabled={!instruction.trim() || busy !== undefined}
                      onClick={() => void submitGuidance(task.id)}
                    >
                      {busy === `${task.id}:redirect` ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Send size={12} />
                      )}
                      Apply and restart
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Section>
  );
}

export function AgentContextPanel({
  channelId,
  onClose,
}: {
  channelId: string;
  onClose: () => void;
}) {
  const [inspection, setInspection] = useState<AgentContextInspection | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setInspection(null);
    setError(null);
    void inspectAgentDMContext(channelId)
      .then((result) => {
        if (current) setInspection(result);
      })
      .catch((reason: unknown) => {
        if (!current) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      current = false;
    };
  }, [channelId]);

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 360, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="no-drag-region flex flex-shrink-0 flex-col overflow-hidden border-l border-sidebar-border bg-sidebar text-sidebar-foreground"
      aria-label="Agent work and context"
    >
      <div className="flex items-start gap-2 border-b border-sidebar-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">
            {inspection ? `${inspection.agent.name}'s work` : "Agent work"}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Private control · status comes from Agent Host
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition-colors pointer-events-auto hover:bg-sidebar-hover hover:text-sidebar-foreground"
          title="Close"
          aria-label="Close agent work"
        >
          <X size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!inspection && !error && (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Reading renderer-owned context…
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
            {error}
          </div>
        )}

        {inspection && (
          <>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-sm font-medium">{inspection.agent.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {inspection.agent.description}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {inspection.agent.providerId ?? "Conversation provider"}
                {inspection.agent.modelId
                  ? ` · ${inspection.agent.modelId}`
                  : " · conversation model"}
              </p>
            </div>

            <AgentWorkSection agentId={inspection.agent.id} />

            <Section icon={ListTree} title="Recent turns">
              <AgentTraceSection memberId={inspection.agent.memberId} />
            </Section>

            <Section icon={Brain} title="Injected / session identity">
              <p className="text-xs leading-relaxed text-muted-foreground">
                This prompt defines a new or rotated native session. On resume,
                the provider retains its own opaque history.
              </p>
              <details>
                <summary className="cursor-pointer text-xs font-medium pointer-events-auto">
                  Effective system prompt
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/70 p-2 text-[11px] leading-relaxed text-foreground">
                  {inspection.injected.effectiveSystemPrompt}
                </pre>
              </details>
              <details>
                <summary className="cursor-pointer text-xs font-medium pointer-events-auto">
                  Renderer transcript projection ·{" "}
                  {inspection.injected.transcriptProjection.length}
                </summary>
                <div className="mt-2 space-y-1.5">
                  {inspection.injected.transcriptProjection.length === 0 ? (
                    <Empty>No DM messages are in the bootstrap view yet.</Empty>
                  ) : (
                    inspection.injected.transcriptProjection.map(
                      (message, index) => (
                        <div
                          key={`${message.role}-${index}`}
                          className="rounded-md bg-background/70 p-2 text-[11px] leading-relaxed"
                        >
                          <span className="font-semibold uppercase text-muted-foreground">
                            {message.role}
                          </span>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground">
                            {message.content}
                          </p>
                        </div>
                      ),
                    )
                  )}
                </div>
              </details>
            </Section>

            <Section icon={Eye} title="Available on demand">
              <p className="text-xs leading-relaxed text-muted-foreground">
                These rooms are discoverable through workspace tools; their full
                transcripts are not preloaded into this DM.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {inspection.available.visibleChannels.map((channel) => (
                  <span
                    key={channel.id}
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[11px]",
                      channel.isPrivate
                        ? "border-amber-500/25 bg-amber-500/5"
                        : "border-sidebar-border bg-background/60",
                    )}
                  >
                    {channel.kind === "dm" ? "DM" : "#"} {channel.name}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {inspection.available.workspaceTools.map((tool) => (
                  <code
                    key={tool}
                    className="rounded bg-background/70 px-1.5 py-0.5 text-[11px]"
                  >
                    workspace:{tool}
                  </code>
                ))}
              </div>
            </Section>

            <Section icon={Wrench} title="Configured tool access">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Configuration is not the effective runtime catalog; connection
                state and sandbox policy are resolved when a turn runs.
              </p>
              {inspection.available.configuredMcpServerIds.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {inspection.available.configuredMcpServerIds.map((server) => (
                    <code
                      key={server}
                      className="rounded bg-background/70 px-1.5 py-0.5 text-[11px]"
                    >
                      {server}
                    </code>
                  ))}
                </div>
              ) : (
                <Empty>No agent-specific MCP servers are configured.</Empty>
              )}
              {inspection.available.configuredDisabledTools.length > 0 && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Disabled:{" "}
                  {inspection.available.configuredDisabledTools
                    .map((tool) => `${tool.mcpName}:${tool.toolName}`)
                    .join(", ")}
                </p>
              )}
              {inspection.available.effectiveToolCatalog.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs font-medium pointer-events-auto">
                    Connected runtime tools
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {inspection.available.effectiveToolCatalog.map((group) => (
                      <p
                        key={group.serverName}
                        className="break-words text-[11px] leading-relaxed text-muted-foreground"
                      >
                        <strong className="text-foreground">
                          {group.serverName}:
                        </strong>{" "}
                        {group.toolNames.join(", ") || "No tools"}
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </Section>

            <Section icon={Activity} title="Runtime and durable memory">
              {inspection.runtime.conversation ? (
                <div className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                  <p>
                    Transcript v
                    {inspection.runtime.conversation.transcriptVersion}
                    {" · "}memory v
                    {inspection.runtime.conversation.memoryVersion}
                  </p>
                  {inspection.runtime.conversation.providers
                    .filter(
                      (binding) =>
                        binding.actorId === inspection.agent.memberId,
                    )
                    .map((binding) => (
                      <p key={`${binding.actorId}:${binding.providerId}`}>
                        {binding.providerId}
                        {binding.modelId ? ` · ${binding.modelId}` : ""}
                        {binding.stale ? " · stale" : " · resumable"}
                      </p>
                    ))}
                </div>
              ) : (
                <Empty>No provider session is bound to this DM yet.</Empty>
              )}
              {inspection.runtime.memory ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Memory {inspection.runtime.memory.health}
                  {inspection.runtime.memory.memoryVersion !== undefined
                    ? ` · v${inspection.runtime.memory.memoryVersion}`
                    : ""}
                  {inspection.runtime.memory.detail
                    ? ` · ${inspection.runtime.memory.detail}`
                    : ""}
                </p>
              ) : (
                <Empty>Durable memory status is not available.</Empty>
              )}
              {inspection.runtime.errors.map((runtimeError) => (
                <p
                  key={runtimeError}
                  className="text-[11px] leading-relaxed text-destructive"
                >
                  {runtimeError}
                </p>
              ))}
            </Section>

            <Section icon={LockKeyhole} title="Opaque boundaries">
              <div className="space-y-2">
                {inspection.opaque.map((item) => (
                  <div key={item.label}>
                    <p className="text-xs font-medium">{item.label}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </motion.aside>
  );
}
