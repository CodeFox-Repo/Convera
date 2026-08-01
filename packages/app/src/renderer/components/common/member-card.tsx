import React, { useState } from "react";
import { MessageCircle, Plus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/renderer/components/ui/popover";
import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import type { Member } from "@/shared/types/workspace";
import { useLiveQuery } from "dexie-react-hooks";
import { db, memberIdForAgent } from "@/renderer/libs/db";
import {
  normalizeTagName,
  setMemberTag,
  useTags,
} from "@/renderer/libs/stores/tag-store";
import { cn } from "@/renderer/libs/utils/tailwind";
import { AgentTraceSection } from "@/renderer/components/chat/AgentTraceSection";
import { openAgentDM } from "@/renderer/libs/agent-dm";
import { useWorkspaceUI } from "@/renderer/libs/stores/workspace-ui-context";
import { openAgentTasks, taskStatusLabel } from "@/renderer/libs/agent-tasks";
import { useAgentHostTasks } from "@/renderer/libs/hooks/use-agent-host-jobs";
import { useChannels } from "@/renderer/libs/stores/channel-store";

/**
 * Who someone is, and what they are — wrapped around whatever shows them.
 *
 * The card is the same for a human and an agent because the workspace treats
 * them the same: only the way you talk to them differs. Tags are editable
 * right here rather than in a settings screen, since the question "what is
 * this person allowed to see" almost always arrives while looking at them.
 */
export function MemberCard({
  member,
  children,
  align = "start",
  side = "left",
}: {
  member: Member;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-72 p-0">
        <MemberCardBody member={member} onLeave={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function MemberCardBody({
  member,
  onLeave,
}: {
  member: Member;
  onLeave: () => void;
}) {
  const agent = useLiveQuery(
    () => (member.agentId ? db.agents.get(member.agentId) : undefined),
    [member.agentId],
  );
  const tags = useTags();
  const { setView } = useWorkspaceUI();
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const held = member.tags ?? [];
  // Tags that exist but this member does not hold — the menu of what can be
  // granted without inventing a new name.
  const grantable = (tags ?? [])
    .map((tag) => tag.name)
    .filter((name) => !held.includes(name));

  const grant = async (name: string) => {
    const normalized = normalizeTagName(name);
    if (!normalized) return;
    await setMemberTag(member.id, normalized, true);
    setDraft("");
    setIsAdding(false);
  };

  return (
    <div>
      <div className="flex items-start gap-3 p-4 pb-3">
        <MemberAvatar member={member} className="size-14" />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-base font-semibold leading-tight">
            {member.name}
          </p>
          <p className="text-xs capitalize text-muted-foreground">
            {member.kind}
            {member.status !== "idle" && ` · ${member.status}`}
          </p>
        </div>
      </div>

      {agent?.description && (
        <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
          {agent.description}
        </p>
      )}

      {/* Walking to their desk, from wherever you happened to be looking at
          them. Only agents: a DM with the local human is a note to self, and
          there is no second person to open one with. */}
      {/* Not for the built-in assistant: it converses through its own
          many-conversation section, and a DM would fork that identity into a
          second, different conversation model. */}
      {member.kind === "agent" &&
        member.agentId &&
        member.id !== "agent:default" && (
          <div className="px-4 pb-3">
            <button
              type="button"
              onClick={() => {
                const agentId = member.agentId;
                if (!agentId) return;
                void openAgentDM(agentId).then(() => {
                  setView("chat");
                  onLeave();
                });
              }}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium",
                "bg-sidebar-accent transition-colors pointer-events-auto hover:bg-sidebar-hover",
              )}
            >
              <MessageCircle size={13} />
              <span>Message</span>
            </button>
          </div>
        )}

      <div className="border-t px-4 py-3">
        <p className="pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Tags
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {held.map((name) => (
            <span
              key={name}
              className="group/tag flex items-center gap-1 rounded-md bg-sidebar-accent py-1 pl-2 pr-1 text-xs"
            >
              <span className="truncate">{name}</span>
              <button
                type="button"
                onClick={() => void setMemberTag(member.id, name, false)}
                className="rounded p-0.5 text-muted-foreground transition-colors pointer-events-auto hover:text-foreground"
                aria-label={`Remove ${name}`}
                title={`Remove ${name}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}

          {isAdding ? (
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                setIsAdding(false);
                setDraft("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void grant(draft);
                if (event.key === "Escape") {
                  setIsAdding(false);
                  setDraft("");
                }
              }}
              placeholder="Tag name"
              className="w-24 rounded-md bg-sidebar-accent px-2 py-1 text-xs outline-none ring-1 ring-primary/40"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className={cn(
                "flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground",
                "transition-colors pointer-events-auto hover:bg-sidebar-hover hover:text-foreground",
              )}
              aria-label="Add tag"
              title="Add tag"
            >
              <Plus size={12} />
            </button>
          )}
        </div>

        {isAdding && grantable.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {grantable
              .filter((name) => name.includes(normalizeTagName(draft)))
              .slice(0, 6)
              .map((name) => (
                <button
                  key={name}
                  type="button"
                  // Fires before the input's blur can close the editor.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    void grant(name);
                  }}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors pointer-events-auto hover:bg-sidebar-hover hover:text-foreground"
                >
                  {name}
                </button>
              ))}
          </div>
        )}

        {held.length === 0 && !isAdding && (
          <p className="pt-1 text-xs text-muted-foreground">
            No tags. Tags decide which channels they can find.
          </p>
        )}
      </div>

      {member.kind === "agent" && member.agentId && (
        <AgentWorkload agentId={member.agentId} />
      )}

      {/* Reachable from the room where the behaviour happens, not only from a
          DM: "three colleagues showed as typing and one answered" is a
          question you ask while looking at that channel. */}
      {member.kind === "agent" && (
        <div className="max-h-64 overflow-y-auto border-t px-4 py-3">
          <p className="pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recent turns
          </p>
          <AgentTraceSection memberId={member.id} />
        </div>
      )}
    </div>
  );
}

/**
 * What this colleague is carrying right now.
 *
 * "Recent turns" answers what they last did; this answers what they are still
 * on, which is the question you actually have before handing them one more
 * thing. Read-only on purpose — the controls live in the DM's work panel,
 * where guidance is private and belongs.
 */
function AgentWorkload({ agentId }: { agentId: string }) {
  const { tasks } = useAgentHostTasks(memberIdForAgent(agentId));
  const channels = useChannels();
  const open = openAgentTasks(tasks);

  if (open.length === 0) return null;

  const channelNames = new Map(
    (channels ?? []).map((channel) => [channel.id, channel.name]),
  );

  return (
    <div className="border-t px-4 py-3">
      <p className="pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Working on
        <span className="ml-1.5 font-normal normal-case tracking-normal">
          {open.length}
        </span>
      </p>
      <ul className="space-y-1">
        {open.slice(0, 5).map((task) => (
          <li key={task.id} className="flex items-baseline gap-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate">
              #{channelNames.get(task.channelId) ?? task.channelId}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {taskStatusLabel(task.status)}
            </span>
          </li>
        ))}
        {open.length > 5 && (
          <li className="text-xs text-muted-foreground">
            and {open.length - 5} more
          </li>
        )}
      </ul>
    </div>
  );
}
