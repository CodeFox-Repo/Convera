import {
  inspectAgentDMContext,
  type AgentContextInspection,
} from "@/renderer/libs/agent-context-inspector";
import { cn } from "@/renderer/libs/utils/tailwind";
import { motion } from "framer-motion";
import {
  Activity,
  Brain,
  Eye,
  Loader2,
  LockKeyhole,
  Wrench,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";

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

/**
 * Private, out-of-band inspection of the context Convera can account for.
 * Nothing rendered here is appended to the DM transcript or exposed as an
 * agent tool. Home owns whether the panel is mounted; the loader itself still
 * rejects non-DM channels so a public header cannot accidentally reuse it.
 */
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
      aria-label="Agent context"
    >
      <div className="flex items-start gap-2 border-b border-sidebar-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">
            {inspection
              ? `${inspection.agent.name}'s context`
              : "Agent context"}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Private inspector · never posted to the conversation
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition-colors pointer-events-auto hover:bg-sidebar-hover hover:text-sidebar-foreground"
          title="Close"
          aria-label="Close agent context"
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
