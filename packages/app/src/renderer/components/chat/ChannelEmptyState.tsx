import { BaseLogo } from "@/renderer/components/common/base-logo";
import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import { useAgents } from "@/renderer/libs/db/hooks";
import { composeChannelPrompts } from "@/renderer/libs/first-run";
import { useLocalAIProviders } from "@/renderer/libs/hooks/use-local-ai-providers";
import { DEFAULT_LOCAL_AI_PROVIDER_ID } from "@/renderer/libs/local-ai";
import { describeProviderStatus } from "@/renderer/libs/provider-status";
import { useMembers } from "@/renderer/libs/stores/member-store";
import type { Channel } from "@/renderer/libs/stores/channel-store";
import type { Member } from "@/shared/types/workspace";
import { AlertTriangle, Hash, Lock } from "lucide-react";
import React, { useMemo } from "react";

/**
 * The first thing a new workspace actually says to you.
 *
 * A room with no messages used to render its name and nothing else, which
 * leaves three facts unsaid: what the room is for, that the colleagues in it
 * are participants who answer when spoken to, and how you address one. All
 * three are already in the data — the channel description, the roster, the
 * agent's own description — so this only has to show them.
 */
export function ChannelEmptyState({
  channel,
  onUsePrompt,
  onOpenSettings,
}: {
  channel: Channel;
  /** Drops an example message into the composer rather than sending it. */
  onUsePrompt: (prompt: string) => void;
  onOpenSettings: () => void;
}) {
  const allMembers = useMembers();
  const agents = useAgents();
  const Icon = channel.isPrivate ? Lock : Hash;

  const agentMembers = useMemo(() => {
    const byId = new Map(
      (allMembers ?? []).map((member) => [member.id, member]),
    );
    return channel.memberIds.flatMap((id) => {
      const member = byId.get(id);
      return member?.kind === "agent" ? [member] : [];
    });
  }, [allMembers, channel.memberIds]);

  const prompts = composeChannelPrompts({
    channelName: channel.name,
    agentNames: agentMembers.map((member) => member.name),
  });

  // Every starter colleague is pinned to this provider at hire time, so a
  // missing key here means nobody in the room can answer — worth saying before
  // the user types into a room that will stay silent.
  const { providers, loading, error } = useLocalAIProviders();
  const provider = providers.find(
    (candidate) => candidate.id === DEFAULT_LOCAL_AI_PROVIDER_ID,
  );
  const status = provider ? describeProviderStatus(provider, loading) : null;

  const roleFor = (member: Member): string | undefined =>
    agents?.find((agent) => agent.id === member.agentId)?.description;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-6 py-8 text-left">
      <div>
        <div className="flex items-center gap-2">
          <Icon size={20} className="flex-shrink-0 text-muted-foreground" />
          <h3 className="min-w-0 text-xl font-semibold text-foreground">
            {channel.name}
          </h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {channel.description ??
            `This is the start of #${channel.name}. Nothing has been said here yet.`}
        </p>
      </div>

      {agentMembers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            In this room
          </p>
          {agentMembers.map((member) => (
            <div key={member.id} className="flex items-center gap-2.5">
              <MemberAvatar member={member} className="size-7" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm leading-tight text-foreground">
                  {member.name}
                </span>
                <span className="block truncate text-xs leading-tight text-muted-foreground">
                  {roleFor(member) ?? "Colleague"}
                </span>
              </span>
            </div>
          ))}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Mention a colleague by name to ask them directly. For a general
            message, each colleague decides whether to reply. Their AI provider
            must be configured before they can answer.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Choose a suggestion to edit before sending.
        </p>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Add a starter message
        </p>
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onUsePrompt(prompt)}
            className="block w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors pointer-events-auto hover:border-ring hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>

      {!loading && (error || (status && !status.ready)) && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive px-3 py-2 text-xs text-destructive">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <p className="min-w-0 flex-1 leading-relaxed">
            {error ??
              `${provider?.name ?? "The default provider"} needs setup. ${status?.hint ?? "Check provider settings."}`}{" "}
            <button
              type="button"
              onClick={onOpenSettings}
              className="underline pointer-events-auto hover:no-underline"
            >
              Open Settings → General
            </button>{" "}
            to check providers. Colleagues may have a different provider set in
            Agents.
          </p>
        </div>
      )}
    </div>
  );
}

/** No room selected at all — a plain chat, or nothing opened yet. */
export function WorkspaceEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 px-6 text-center">
      <BaseLogo size={64} />
      <div>
        <h3 className="text-2xl font-bold text-foreground">
          Welcome to Convera
        </h3>
        <p className="mt-2 text-muted-foreground">
          Start a conversation by typing a message below.
        </p>
      </div>
    </div>
  );
}
