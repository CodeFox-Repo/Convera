import {
  addChannelMember,
  removeChannelMember,
  setChannelDefaultAgent,
  type Channel,
} from "@/renderer/libs/stores/channel-store";
import {
  LOCAL_HUMAN_MEMBER_ID,
  useMembers,
} from "@/renderer/libs/stores/member-store";
import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import { cn } from "@/renderer/libs/utils/tailwind";
import { useAgentHostJobs } from "@/renderer/libs/hooks/use-agent-host-jobs";
import type { Member } from "@/shared/types/workspace";
import { AnimatePresence, motion } from "framer-motion";
import { Hash, LoaderCircle, Lock, Plus, Square, Star, X } from "lucide-react";
import React, { useMemo, useState } from "react";

interface ChannelHeaderProps {
  channel: Channel;
}

/**
 * Names the room and shows who is in it — this roster is what tells you which
 * `@` names the input will accept. The roster opens as a side pane sliding in
 * from the right, Slack-style, not a floating popover.
 */
export function ChannelHeader({ channel }: ChannelHeaderProps) {
  const allMembers = useMembers();
  const [paneOpen, setPaneOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const {
    jobs,
    activeJobs,
    error: hostError,
    cancel,
  } = useAgentHostJobs(channel.id);
  const latestJob = jobs.at(-1);
  const latestFailure =
    latestJob?.status === "failed" || latestJob?.status === "interrupted"
      ? latestJob
      : undefined;
  const Icon = channel.isPrivate ? Lock : Hash;

  const members = useMemo(() => {
    const byId = new Map((allMembers ?? []).map((m) => [m.id, m]));
    return channel.memberIds
      .map((id) => byId.get(id))
      .filter((m): m is Member => m !== undefined);
  }, [allMembers, channel.memberIds]);

  // Only agents can be invited: there is exactly one human on this install.
  const available = useMemo(
    () =>
      (allMembers ?? []).filter(
        (m) => m.kind === "agent" && !channel.memberIds.includes(m.id),
      ),
    [allMembers, channel.memberIds],
  );

  return (
    <>
      <div className="no-drag-region flex items-center gap-2 border-b border-border px-6 py-2">
        <Icon size={15} className="flex-shrink-0 text-muted-foreground" />
        <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">
          {channel.name}
        </h2>
        {activeJobs.length > 0 && (
          <span
            className="flex items-center gap-1 text-xs text-muted-foreground"
            title={`${activeJobs.length} background agent job${activeJobs.length === 1 ? "" : "s"}`}
          >
            <LoaderCircle size={12} className="animate-spin" />
            {activeJobs.length} working
          </span>
        )}
        {hostError && (
          <span className="truncate text-xs text-destructive" title={hostError}>
            Agent Host unavailable
          </span>
        )}
        {!hostError && activeJobs.length === 0 && latestFailure?.error && (
          <span
            className="max-w-56 truncate text-xs text-destructive"
            title={latestFailure.error}
          >
            Agent error: {latestFailure.error}
          </span>
        )}

        <button
          onClick={() => setPaneOpen((open) => !open)}
          className={cn(
            "ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors pointer-events-auto",
            paneOpen
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          aria-label={`${members.length} members`}
          aria-expanded={paneOpen}
          title="Members"
        >
          <span className="flex items-center -space-x-1.5">
            {members.slice(0, 5).map((member) => (
              <MemberAvatar
                key={member.id}
                member={member}
                className="size-5"
              />
            ))}
          </span>
          <span className="text-xs">{members.length}</span>
        </button>
      </div>

      <AnimatePresence>
        {paneOpen && (
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            // Sits above the message list, below dialogs. Sidebar material, not
            // popover white — this is furniture, not a floating hint.
            className="no-drag-region absolute inset-y-0 right-0 z-30 flex w-72 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg"
            aria-label="Channel members"
          >
            <div className="flex items-center gap-2 px-4 pb-2 pt-4">
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
                Members
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {members.length}
                </span>
              </h3>
              <button
                onClick={() => setInviting((v) => !v)}
                className={cn(
                  "rounded-md p-1.5 transition-colors pointer-events-auto",
                  inviting
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground",
                )}
                title="Invite to channel"
                aria-label="Invite to channel"
                aria-expanded={inviting}
              >
                <Plus size={15} />
              </button>
              <button
                onClick={() => setPaneOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors pointer-events-auto hover:bg-sidebar-hover hover:text-sidebar-foreground"
                title="Close"
                aria-label="Close members pane"
              >
                <X size={15} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {inviting && (
                <div className="mb-2 rounded-lg bg-sidebar-accent p-1">
                  <p className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Invite
                  </p>
                  {available.length > 0 ? (
                    available.map((member) => (
                      <button
                        key={member.id}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors pointer-events-auto hover:bg-sidebar-hover"
                        onClick={() =>
                          void addChannelMember(channel.id, member.id)
                        }
                      >
                        <MemberAvatar member={member} className="size-6" />
                        <span className="min-w-0 flex-1 truncate">
                          {member.name}
                        </span>
                        <Plus size={13} className="text-muted-foreground" />
                      </button>
                    ))
                  ) : (
                    <p className="px-2 pb-2 text-xs leading-relaxed text-muted-foreground">
                      Everyone from your org is already here. Hire more agents
                      in Settings → Talent Market.
                    </p>
                  )}
                </div>
              )}

              {members.map((member) => {
                const isDefault = channel.defaultAgentMemberId === member.id;
                const memberJobs = activeJobs.filter(
                  (job) => job.agentMemberId === member.id,
                );
                return (
                  <div
                    key={member.id}
                    className="group/member flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-hover"
                  >
                    <MemberAvatar member={member} className="size-7" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate leading-tight">
                        {member.name}
                      </span>
                      <span className="block truncate text-xs leading-tight text-muted-foreground">
                        {memberJobs.length > 0
                          ? memberJobs.some((job) => job.status === "running")
                            ? "Working in background"
                            : "Queued"
                          : isDefault
                            ? "Default responder"
                            : member.kind}
                      </span>
                    </span>

                    {memberJobs.length > 0 && (
                      <button
                        className="rounded p-1 text-muted-foreground pointer-events-auto hover:bg-sidebar-hover hover:text-sidebar-foreground"
                        onClick={() =>
                          void Promise.all(
                            memberJobs.map((job) => cancel(job.id)),
                          )
                        }
                        title={`Stop ${member.name}'s background work`}
                        aria-label={`Stop ${member.name}'s background work`}
                      >
                        <Square size={12} />
                      </button>
                    )}

                    {/* Faded rather than hidden: display:none would put these
                        out of reach of the keyboard entirely. */}
                    {member.kind === "agent" && !isDefault && (
                      <button
                        className="text-muted-foreground opacity-0 transition-opacity pointer-events-auto hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/member:opacity-100"
                        onClick={() =>
                          void setChannelDefaultAgent(channel.id, member.id)
                        }
                        title="Set as default responder"
                        aria-label={`Set ${member.name} as default responder`}
                      >
                        <Star size={13} />
                      </button>
                    )}

                    {member.id !== LOCAL_HUMAN_MEMBER_ID && (
                      <button
                        className="text-muted-foreground opacity-0 transition-opacity pointer-events-auto hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/member:opacity-100"
                        onClick={() =>
                          void removeChannelMember(channel.id, member.id)
                        }
                        title="Remove from channel"
                        aria-label={`Remove ${member.name} from channel`}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
