import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import { useAgentHostJobs } from "@/renderer/libs/hooks/use-agent-host-jobs";
import { useMembers } from "@/renderer/libs/stores/member-store";
import { useTypingStore } from "@/renderer/libs/stores/typing-store";
import { AlertTriangle, X } from "lucide-react";
import React, { useState } from "react";

/**
 * "Elena is typing…", driven by an agent actually reaching for its speech tool.
 *
 * This exists because nothing is placed in the transcript until the agent
 * commits to speaking: without it a room would sit silent while somebody
 * composes. It deliberately does not occupy a message row — it is a hint that
 * someone is about to speak, not a claim that they did.
 */
/**
 * Why the colleague you were waiting on never spoke, said where you were
 * waiting for it.
 *
 * The reason already exists — a turn whose provider has no API key or no CLI
 * fails with "OPENAI_API_KEY not set" or 'Run "claude login" to authenticate.',
 * which the host stores on the job. Until this, the only place it surfaced was
 * a `max-w-56 truncate` span in the channel header, which cuts every one of
 * those messages off mid-sentence and sits far from the transcript the user is
 * actually watching. Same data, put where the waiting happened.
 */
export function AgentTurnFailureNotice({
  channelId,
  conversationId,
}: {
  channelId?: string | null;
  conversationId?: string | null;
}) {
  const { jobs } = useAgentHostJobs(channelId ?? undefined);
  const members = useMembers();
  const [dismissed, setDismissed] = useState<string>();

  // A channel that was rebuilt keeps its id but gets a new conversation, so a
  // failure from its previous life is not something the user can act on.
  const failure = [...jobs]
    .reverse()
    .find(
      (job) =>
        job.conversationId === conversationId &&
        job.error &&
        (job.status === "failed" || job.status === "interrupted"),
    );
  if (!failure || failure.id === dismissed) return null;

  const who =
    (members ?? []).find((member) => member.id === failure.agentMemberId)
      ?.name ?? "An agent";

  return (
    <div className="flex items-start gap-2 px-2 pb-1.5 text-xs text-destructive">
      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
      <p className="min-w-0 flex-1 leading-relaxed">
        <span className="font-medium">{who}</span> could not answer:{" "}
        {failure.error}
      </p>
      <button
        type="button"
        onClick={() => setDismissed(failure.id)}
        className="mt-0.5 flex-shrink-0 rounded p-0.5 transition-opacity pointer-events-auto hover:opacity-70"
        aria-label="Dismiss agent error"
        title="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function TypingIndicator({
  conversationId,
}: {
  conversationId?: string | null;
}) {
  const typing = useTypingStore((state) => state.typing);
  const members = useMembers();

  const names = conversationId
    ? [
        ...new Set(
          Object.values(typing)
            .filter((entry) => entry.conversationId === conversationId)
            .map((entry) => entry.memberId),
        ),
      ]
    : [];
  if (names.length === 0) return null;

  const byId = new Map((members ?? []).map((member) => [member.id, member]));
  const present = names.flatMap((id) => {
    const member = byId.get(id);
    return member ? [member] : [];
  });
  if (present.length === 0) return null;

  const label =
    present.length === 1
      ? `${present[0].name} is typing`
      : present.length === 2
        ? `${present[0].name} and ${present[1].name} are typing`
        : `${present[0].name} and ${present.length - 1} others are typing`;

  return (
    <div className="flex items-center gap-2 px-2 pb-1 text-xs text-muted-foreground">
      <span className="flex items-center -space-x-1.5">
        {present.slice(0, 3).map((member) => (
          <MemberAvatar key={member.id} member={member} className="size-4" />
        ))}
      </span>
      <span className="truncate">{label}</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1 animate-bounce rounded-full bg-muted-foreground"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </div>
  );
}
